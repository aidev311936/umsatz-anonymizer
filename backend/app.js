const express = require("express");
const cookieParser = require("cookie-parser");
const { randomBytes } = require("node:crypto");

const DEFAULT_TOKEN_TTL = 60 * 60 * 24; // 24 hours
const DEFAULT_GITHUB_PAGES_ORIGIN = "https://aidev311936.github.io";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const ALLOWED_TRANSACTION_KEYS = new Set([
  "bank_name",
  "booking_date",
  "booking_date_raw",
  "booking_date_iso",
  "booking_text",
  "booking_type",
  "booking_amount",
  "booking_hash",
  "booking_account",
]);
const ALLOWED_MASK_STRATEGIES = new Set(["full", "keepFirstLast", "partialPercent"]);

function parseOrigins(input) {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map((value) => value.trim())
    .map(normalizeOrigin)
    .filter((value) => value.length > 0);
}

function normalizeOrigin(value) {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

function stripPort(host) {
  if (!host) {
    return "";
  }
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host.toLowerCase() : host.slice(0, end + 1).toLowerCase();
  }
  const idx = host.indexOf(":");
  const base = idx === -1 ? host : host.slice(0, idx);
  return base.toLowerCase();
}

function extractHost(origin) {
  if (!origin) {
    return "";
  }
  try {
    const url = new URL(origin);
    return stripPort(url.host);
  } catch {
    return stripPort(origin);
  }
}

function determineBackendHost() {
  const originEnvKeys = [
    "BACKEND_PUBLIC_ORIGIN",
    "BACKEND_PUBLIC_URL",
    "PUBLIC_BACKEND_ORIGIN",
    "PUBLIC_BACKEND_URL",
    "BACKEND_URL",
    "RENDER_EXTERNAL_URL",
  ];
  for (const key of originEnvKeys) {
    const value = normalizeOrigin(process.env[key]);
    if (value) {
      const host = extractHost(value);
      if (host) {
        return host;
      }
    }
  }
  const hostEnvKeys = ["BACKEND_HOST", "HOST", "HOSTNAME"];
  for (const key of hostEnvKeys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      const host = stripPort(value.trim());
      if (host) {
        return host;
      }
    }
  }
  return "localhost";
}

function shouldUseCrossSitePolicy(origins, backendHost, includeDefaultOrigin) {
  const inspected = new Set(origins);
  if (includeDefaultOrigin) {
    inspected.add(normalizeOrigin(DEFAULT_GITHUB_PAGES_ORIGIN));
  }
  const backend = stripPort(backendHost);
  for (const origin of inspected) {
    if (!origin) {
      continue;
    }
    const host = extractHost(origin);
    if (!host) {
      continue;
    }
    if (backend && host === backend) {
      continue;
    }
    const backendLocal = backend ? LOCAL_HOSTNAMES.has(backend) : true;
    const originLocal = LOCAL_HOSTNAMES.has(host);
    if (originLocal && backendLocal) {
      continue;
    }
    if (!backend && originLocal) {
      continue;
    }
    return true;
  }
  return false;
}

function parseBooleanEnv(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseSameSiteEnv(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["lax", "strict", "none"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeBasePath(input) {
  if (!input) {
    return "/";
  }
  let base = input.trim();
  if (base.length === 0) {
    return "/";
  }
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base.length > 1 && base.endsWith("/")) {
    base = base.replace(/\/+$/, "");
  }
  return base || "/";
}

function isUnifiedTransaction(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_TRANSACTION_KEYS.has(key)) {
      return false;
    }
  }
  if (typeof value.booking_text !== "string" || typeof value.booking_amount !== "string") {
    return false;
  }
  if (typeof value.bank_name !== "string" || value.bank_name.length === 0) {
    return false;
  }
  if (typeof value.booking_date !== "string" || value.booking_date.length === 0) {
    return false;
  }
  if (typeof value.booking_type !== "string") {
    return false;
  }
  if ("booking_account" in value && typeof value.booking_account !== "string") {
    return false;
  }
  if ("booking_hash" in value && typeof value.booking_hash !== "string") {
    return false;
  }
  return true;
}

function isDetectionPayload(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(["header_signature", "without_header"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "header_signature")) {
    const headerSignature = value.header_signature;
    if (!Array.isArray(headerSignature) || !headerSignature.every((entry) => typeof entry === "string")) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "without_header")) {
    const withoutHeader = value.without_header;
    if (typeof withoutHeader !== "object" || withoutHeader === null || Array.isArray(withoutHeader)) {
      return false;
    }

    const nestedKeys = new Set(["column_count", "column_markers"]);
    for (const key of Object.keys(withoutHeader)) {
      if (!nestedKeys.has(key)) {
        return false;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(withoutHeader, "column_count") &&
      (!Number.isInteger(withoutHeader.column_count) || withoutHeader.column_count < 0)
    ) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(withoutHeader, "column_markers")) {
      const markers = withoutHeader.column_markers;
      if (!Array.isArray(markers) || !markers.every((entry) => typeof entry === "string")) {
        return false;
      }
    }
  }

  return true;
}

function isBankMapping(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value;
  if (typeof maybe.bank_name !== "string" || maybe.bank_name.trim().length === 0) {
    return false;
  }
  if (!Array.isArray(maybe.booking_date) || !Array.isArray(maybe.booking_text) || !Array.isArray(maybe.booking_type) || !Array.isArray(maybe.booking_amount)) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(maybe, "booking_date_parse_format") &&
    typeof maybe.booking_date_parse_format !== "string"
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(maybe, "without_header") &&
    typeof maybe.without_header !== "boolean"
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(maybe, "detection") &&
    maybe.detection !== null &&
    !isDetectionPayload(maybe.detection)
  ) {
    return false;
  }
  return true;
}

function isAnonymizationRule(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value;
  if (typeof maybe.id !== "string" || maybe.id.trim().length === 0) {
    return false;
  }
  if (!Array.isArray(maybe.fields) || maybe.fields.length === 0) {
    return false;
  }
  if (!maybe.fields.every((field) => typeof field === "string" && ALLOWED_TRANSACTION_KEYS.has(field))) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(maybe, "enabled") && typeof maybe.enabled !== "boolean") {
    return false;
  }

  if (maybe.type === "regex") {
    if (typeof maybe.pattern !== "string" || typeof maybe.replacement !== "string") {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(maybe, "flags") && typeof maybe.flags !== "string") {
      return false;
    }
    return true;
  }

  if (maybe.type === "mask") {
    if (typeof maybe.maskStrategy !== "string" || !ALLOWED_MASK_STRATEGIES.has(maybe.maskStrategy)) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(maybe, "maskChar") &&
      maybe.maskChar !== undefined &&
      typeof maybe.maskChar !== "string"
    ) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(maybe, "minLen") &&
      maybe.minLen !== undefined &&
      (!Number.isInteger(maybe.minLen) || maybe.minLen < 0)
    ) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(maybe, "maskPercent") &&
      maybe.maskPercent !== undefined &&
      typeof maybe.maskPercent !== "number"
    ) {
      return false;
    }
    return true;
  }

  return false;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createApp({ db, origins = [], basePath } = {}) {
  const app = express();
  const maxPayload = process.env.MAX_PAYLOAD ?? "2mb";
  const configuredOrigins = origins.length > 0 ? origins : parseOrigins(process.env.ALLOWED_ORIGINS);
  const normalizedConfigured = configuredOrigins
    .map(normalizeOrigin)
    .filter((value) => value.length > 0);
  const allowAllOrigins = normalizedConfigured.length === 0;
  const allowedOrigins = new Set(normalizedConfigured);
  allowedOrigins.add(normalizeOrigin(DEFAULT_GITHUB_PAGES_ORIGIN));
  const tokenCookieName = process.env.TOKEN_COOKIE_NAME ?? "umsatz_token";
  const tokenTtlSeconds = Math.max(60, parseInt(process.env.AUTH_TOKEN_TTL ?? "" + DEFAULT_TOKEN_TTL, 10) || DEFAULT_TOKEN_TTL);
  const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
  const backendHost = determineBackendHost();
  const crossSiteCookiePolicy = shouldUseCrossSitePolicy(
    normalizedConfigured,
    backendHost,
    nodeEnv === "production",
  );
  const secureOverride = parseBooleanEnv(process.env.AUTH_COOKIE_SECURE);
  let secureCookies = secureOverride ?? (nodeEnv === "production" || crossSiteCookiePolicy);
  let sameSitePolicy = parseSameSiteEnv(process.env.AUTH_COOKIE_SAMESITE);
  if (!sameSitePolicy) {
    sameSitePolicy = secureCookies || crossSiteCookiePolicy ? "none" : "lax";
  }
  if (sameSitePolicy === "none" && !secureCookies) {
    secureCookies = true;
  }
  const configuredBasePath = normalizeBasePath(basePath ?? process.env.API_BASE_PATH);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowAllOrigins || allowedOrigins.has(normalizedOrigin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Vary", "Origin");
      }
    } else if (allowedOrigins.size === 0) {
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: maxPayload }));
  app.use(cookieParser());

  function setAuthCookie(res, token) {
    res.cookie(tokenCookieName, token, {
      httpOnly: true,
      sameSite: sameSitePolicy,
      secure: secureCookies,
      maxAge: tokenTtlSeconds * 1000,
      path: "/",
    });
  }

  async function requireAuth(req, res, next) {
    const token = req.cookies[tokenCookieName];
    if (!token) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    const exists = await db.tokenExists(token);
    if (!exists) {
      res.status(401).json({ error: "INVALID_TOKEN" });
      return;
    }
    req.authToken = token;
    next();
  }

  function registerRoutes(router) {
    function normalizeRulePayload(payload) {
      if (typeof payload !== "object" || payload === null) {
        return null;
      }
      const id = typeof payload.id === "string" ? payload.id.trim() : "";
      const fields = Array.isArray(payload.fields)
        ? payload.fields.map((field) => (typeof field === "string" ? field.trim() : field))
        : [];
      return { ...payload, id, fields };
    }

    router.post(
      "/auth/token",
      asyncHandler(async (req, res) => {
        const token = randomBytes(32).toString("base64url");
        const record = await db.createToken(token);
        setAuthCookie(res, token);
        res.status(201).json({
          token,
          created_on: record?.created_on ?? null,
          accessed_on: record?.accessed_on ?? null,
          maxAge: tokenTtlSeconds,
        });
      }),
    );

    router.post(
      "/auth/session",
      asyncHandler(async (req, res) => {
        const supplied = typeof req.body?.token === "string" ? req.body.token.trim() : req.cookies[tokenCookieName];
        if (!supplied) {
          res.status(400).json({ error: "TOKEN_REQUIRED" });
          return;
        }
        const record = await db.touchToken(supplied);
        if (!record) {
          res.status(401).json({ error: "INVALID_TOKEN" });
          return;
        }
        setAuthCookie(res, supplied);
        res.json({
          token: supplied,
          created_on: record.created_on,
          accessed_on: record.accessed_on,
          maxAge: tokenTtlSeconds,
        });
      }),
    );

    router.post(
      "/auth/logout",
      asyncHandler(async (req, res) => {
        res.clearCookie(tokenCookieName, {
          httpOnly: true,
          sameSite: sameSitePolicy,
          secure: secureCookies,
          path: "/",
        });
        res.status(204).end();
      }),
    );

    router.get(
      "/settings",
      requireAuth,
      asyncHandler(async (req, res) => {
        const settings = await db.getSettings(req.authToken);
        res.json({ settings });
      }),
    );

    router.put(
      "/settings",
      requireAuth,
      asyncHandler(async (req, res) => {
        if (typeof req.body !== "object" || req.body === null) {
          res.status(400).json({ error: "INVALID_SETTINGS" });
          return;
        }
        const saved = await db.updateSettings(req.authToken, req.body);
        if (!saved) {
          res.status(404).json({ error: "TOKEN_NOT_FOUND" });
          return;
        }
        res.json({ settings: saved });
      }),
    );

    router.get(
      "/transactions",
      requireAuth,
      asyncHandler(async (req, res) => {
        const transactions = await db.listTransactions(req.authToken);
        res.json({ transactions });
      }),
    );

    router.get(
      "/transactions/imports",
      requireAuth,
      asyncHandler(async (req, res) => {
        const imports = await db.listTransactionImports(req.authToken);
        const normalized = imports.map((entry) => {
          const created = entry.created_on;
          let createdOn = null;
          if (created instanceof Date) {
            createdOn = created.toISOString();
          } else if (typeof created === "string") {
            const parsed = Date.parse(created);
            createdOn = Number.isNaN(parsed) ? created : new Date(parsed).toISOString();
          }

          return {
            bank_name: entry.bank_name ?? "",
            booking_account: entry.booking_account ?? "",
            created_on: createdOn,
            first_booking_date: entry.first_booking_date ?? "",
            last_booking_date: entry.last_booking_date ?? "",
          };
        });

        res.json({ imports: normalized });
      }),
    );

    router.post(
      "/transactions",
      requireAuth,
      asyncHandler(async (req, res) => {
        const entries = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
        const sanitized = entries.filter(isUnifiedTransaction);
        if (sanitized.length !== entries.length) {
          res.status(400).json({ error: "INVALID_TRANSACTION_PAYLOAD" });
          return;
        }
        await db.replaceTransactions(req.authToken, sanitized);
        res.status(204).end();
      }),
    );

    router.get(
      "/transactions/masked",
      requireAuth,
      asyncHandler(async (req, res) => {
        const transactions = await db.readMaskedTransactions(req.authToken);
        res.json({ transactions });
      }),
    );

    router.post(
      "/transactions/masked",
      requireAuth,
      asyncHandler(async (req, res) => {
        const entries = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
        const sanitized = entries.filter(isUnifiedTransaction);
        if (sanitized.length !== entries.length) {
          res.status(400).json({ error: "INVALID_TRANSACTION_PAYLOAD" });
          return;
        }
        await db.replaceMaskedTransactions(req.authToken, sanitized);
        res.status(204).end();
      }),
    );

    router.get(
      "/anonymization-rules",
      requireAuth,
      asyncHandler(async (req, res) => {
        const rules = await db.listAnonymizationRules(req.authToken);
        res.json({ rules });
      }),
    );

    router.put(
      "/anonymization-rules",
      requireAuth,
      asyncHandler(async (req, res) => {
        const incoming = Array.isArray(req.body?.rules) ? req.body.rules : [];
        const sanitized = incoming.map(normalizeRulePayload).filter(isAnonymizationRule);
        if (sanitized.length !== incoming.length) {
          res.status(400).json({ error: "INVALID_RULE_PAYLOAD" });
          return;
        }
        const rules = await db.replaceAnonymizationRules(req.authToken, sanitized);
        res.json({ rules });
      }),
    );

    router.post(
      "/anonymization-rules",
      requireAuth,
      asyncHandler(async (req, res) => {
        const normalized = normalizeRulePayload(req.body);
        if (!isAnonymizationRule(normalized)) {
          res.status(400).json({ error: "INVALID_RULE" });
          return;
        }
        const rule = await db.createAnonymizationRule(req.authToken, normalized);
        res.status(201).json({ rule });
      }),
    );

    router.put(
      "/anonymization-rules/:id",
      requireAuth,
      asyncHandler(async (req, res) => {
        const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
        if (!id) {
          res.status(400).json({ error: "INVALID_RULE_ID" });
          return;
        }
        const normalized = normalizeRulePayload({ ...req.body, id });
        if (!isAnonymizationRule(normalized)) {
          res.status(400).json({ error: "INVALID_RULE" });
          return;
        }
        const rule = await db.updateAnonymizationRule(req.authToken, id, normalized);
        if (!rule) {
          res.status(404).json({ error: "RULE_NOT_FOUND" });
          return;
        }
        res.json({ rule });
      }),
    );

    router.delete(
      "/anonymization-rules/:id",
      requireAuth,
      asyncHandler(async (req, res) => {
        const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
        if (!id) {
          res.status(400).json({ error: "INVALID_RULE_ID" });
          return;
        }
        const deleted = await db.deleteAnonymizationRule(req.authToken, id);
        if (!deleted) {
          res.status(404).json({ error: "RULE_NOT_FOUND" });
          return;
        }
        res.status(204).end();
      }),
    );

    router.get(
      "/bank-mapping",
      requireAuth,
      asyncHandler(async (req, res) => {
        const mappings = await db.listBankMappings(req.authToken);
        res.json({ mappings });
      }),
    );

    router.post(
      "/bank-mapping",
      requireAuth,
      asyncHandler(async (req, res) => {
        if (!isBankMapping(req.body)) {
          res.status(400).json({ error: "INVALID_MAPPING" });
          return;
        }
        await db.upsertBankMapping(req.authToken, req.body);
        res.status(204).end();
      }),
    );

    router.delete(
      "/storage",
      requireAuth,
      asyncHandler(async (req, res) => {
        await Promise.all([
          db.clearTransactions(req.authToken),
          db.clearBankMappings(req.authToken),
          db.clearAnonymizationRules(req.authToken),
          db.updateSettings(req.authToken, {}),
        ]);
        res.status(204).end();
      }),
    );
  }

  const router = express.Router();
  registerRoutes(router);
  app.use(router);

  if (configuredBasePath !== "/") {
    const scopedRouter = express.Router();
    registerRoutes(scopedRouter);
    app.use(configuredBasePath, scopedRouter);
  }

  app.use((err, req, res, _next) => {
    console.error("Unhandled error", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}

module.exports = {
  createApp,
  parseOrigins,
  isUnifiedTransaction,
  isBankMapping,
  normalizeBasePath,
  normalizeOrigin,
};
