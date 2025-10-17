const databaseUrl = process.env.DATABASE_URL?.trim();

if (databaseUrl) {
  console.log("DATABASE_URL detected. Starting database-backed API server.");
  // Delegates to the full backend implementation that persists data in Postgres.
  require("../backend/server.js");
} else {
  console.warn(
    "DATABASE_URL is not configured. Starting legacy in-memory token server.",
  );

  const { createServer } = require("node:http");
  const { randomBytes } = require("node:crypto");
  const { URL } = require("node:url");
  const fs = require("node:fs");
  const fsp = fs.promises;
  const path = require("node:path");

  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  const TOKEN_COOKIE_NAME = process.env.TOKEN_COOKIE_NAME ?? "umsatz_token";
  const TOKEN_TTL_SECONDS = Math.max(
    60,
    parseInt(process.env.AUTH_TOKEN_TTL ?? "86400", 10) || 86400,
  );
  const STATIC_TOKEN = process.env.AUTH_TOKEN?.trim();

  /** @type {Map<string, number>} */
  const generatedTokens = new Map();

  function cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, expiresAt] of generatedTokens.entries()) {
      if (expiresAt <= now) {
        generatedTokens.delete(token);
      }
    }
  }

  function ttlFor(token) {
    cleanupExpiredTokens();
    if (STATIC_TOKEN && token === STATIC_TOKEN) {
      return TOKEN_TTL_SECONDS;
    }
    const expiresAt = generatedTokens.get(token);
    if (!expiresAt) {
      return null;
    }
    const ttlMs = expiresAt - Date.now();
    if (ttlMs <= 0) {
      generatedTokens.delete(token);
      return null;
    }
    return Math.max(1, Math.floor(ttlMs / 1000));
  }

  function rememberToken(token) {
    generatedTokens.set(token, Date.now() + TOKEN_TTL_SECONDS * 1000);
  }

  function generateToken() {
    return randomBytes(32).toString("base64url");
  }

  function jsonResponse(res, statusCode, body, cookie) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (cookie) {
      res.setHeader("Set-Cookie", cookie);
    }
    res.end(JSON.stringify(body));
  }

  function buildCookie(token, maxAgeSeconds) {
    const maxAge = Math.max(1, maxAgeSeconds ?? TOKEN_TTL_SECONDS);
    const parts = [
      `${TOKEN_COOKIE_NAME}=${token}`,
      `Path=/`,
      `Max-Age=${maxAge}`,
      `HttpOnly`,
      `Secure`,
      `SameSite=Strict`,
    ];
    return parts.join("; ");
  }

  async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length === 0) {
      return {};
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("INVALID_JSON");
    }
  }

  function handleTokenRequest(req, res) {
    readJson(req)
      .then((payload) => {
        const { action, token } = payload ?? {};

        if (action === "generate") {
          const newToken = generateToken();
          rememberToken(newToken);
          const cookie = buildCookie(newToken, TOKEN_TTL_SECONDS);
          return jsonResponse(
            res,
            201,
            {
              token: newToken,
              valid: true,
              maxAge: TOKEN_TTL_SECONDS,
              message: "Neues Token erstellt.",
            },
            cookie,
          );
        }

        if (typeof token !== "string" || token.trim() === "") {
          return jsonResponse(
            res,
            400,
            {
              valid: false,
              message: "Es wurde kein Token übermittelt.",
            },
          );
        }

        const trimmedToken = token.trim();
        const remainingTtl = ttlFor(trimmedToken);
        if (!remainingTtl) {
          return jsonResponse(
            res,
            401,
            {
              valid: false,
              message: "Das Token ist ungültig oder abgelaufen.",
            },
          );
        }

        rememberToken(trimmedToken);
        const cookie = buildCookie(trimmedToken, TOKEN_TTL_SECONDS);
        return jsonResponse(
          res,
          200,
          {
            token: trimmedToken,
            valid: true,
            maxAge: TOKEN_TTL_SECONDS,
            message: "Token validiert.",
          },
          cookie,
        );
      })
      .catch((error) => {
        if (error?.message === "INVALID_JSON") {
          return jsonResponse(
            res,
            400,
            {
              valid: false,
              message: "Die Anfrage konnte nicht verarbeitet werden.",
            },
          );
        }
        console.error("/auth/token error", error);
        return jsonResponse(
          res,
          500,
          {
            valid: false,
            message: "Interner Fehler im Authentifizierungsdienst.",
          },
        );
      });
  }

  const STATIC_DIR = path.join(__dirname, "..", "dist");
  const INDEX_HTML_PATH = path.join(STATIC_DIR, "index.html");

  const hasStaticDir = (() => {
    try {
      return fs.statSync(STATIC_DIR).isDirectory();
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("Failed to stat static directory", error);
      }
      return false;
    }
  })();

  const MIME_TYPES = new Map(
    [
      [".html", "text/html; charset=utf-8"],
      [".js", "application/javascript; charset=utf-8"],
      [".css", "text/css; charset=utf-8"],
      [".json", "application/json; charset=utf-8"],
      [".map", "application/json; charset=utf-8"],
      [".svg", "image/svg+xml"],
      [".png", "image/png"],
      [".jpg", "image/jpeg"],
      [".jpeg", "image/jpeg"],
      [".gif", "image/gif"],
      [".webp", "image/webp"],
      [".ico", "image/x-icon"],
      [".txt", "text/plain; charset=utf-8"],
      [".woff", "font/woff"],
      [".woff2", "font/woff2"],
    ].map(([ext, type]) => [ext, type]),
  );

  function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES.get(ext) ?? "application/octet-stream";
  }

  function isImmutableAsset(filePath) {
    const normalized = path.normalize(filePath);
    const assetsDir = path.join(STATIC_DIR, "assets") + path.sep;
    return normalized.startsWith(assetsDir);
  }

  async function tryServeStatic(req, res, url) {
    if (!hasStaticDir) {
      return false;
    }

    const method = req.method?.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return false;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }

    let candidatePath = path.join(STATIC_DIR, pathname);
    const normalized = path.normalize(candidatePath);
    if (!normalized.startsWith(STATIC_DIR)) {
      return false;
    }

    let filePath = normalized;
    let stat;
    try {
      stat = await fsp.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        stat = await fsp.stat(filePath);
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        // Serve the SPA entry point for unknown routes (except asset requests).
        if (!pathname.startsWith("/assets/") && pathname !== "/__vite_ping" && pathname !== "/favicon.ico") {
          try {
            stat = await fsp.stat(INDEX_HTML_PATH);
            filePath = INDEX_HTML_PATH;
          } catch (indexError) {
            if (indexError?.code !== "ENOENT") {
              console.error("Failed to access index.html", indexError);
            }
            return false;
          }
        } else {
          return false;
        }
      } else {
        console.error("Failed to access static asset", error);
        return false;
      }
    }

    const contentType = contentTypeFor(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    if (isImmutableAsset(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }

    if (method === "HEAD") {
      res.setHeader("Content-Length", String(stat.size));
      res.end();
      return true;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("Streaming static asset failed", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(
        JSON.stringify({
          valid: false,
          message: "Interner Fehler beim Ausliefern der Anwendung.",
        }),
      );
    });
    stream.pipe(res);
    return true;
  }

  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const handle = async () => {
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Headers",
          req.headers["access-control-request-headers"] ?? "content-type",
        );
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.end();
        return;
      }

      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }

      if (req.method === "POST" && url.pathname === "/auth/token") {
        handleTokenRequest(req, res);
        return;
      }

      if (await tryServeStatic(req, res, url)) {
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          valid: false,
          message: "Die angeforderte Ressource wurde nicht gefunden.",
        }),
      );
    };

    handle().catch((error) => {
      console.error("Unexpected server error", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(
        JSON.stringify({
          valid: false,
          message: "Interner Fehler im Authentifizierungsdienst.",
        }),
      );
    });
  });

  server.listen(PORT, () => {
    console.log(`Legacy auth service listening on http://localhost:${PORT}`);
  });
}
