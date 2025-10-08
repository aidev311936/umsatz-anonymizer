const { createServer } = require("node:http");
const { randomBytes } = require("node:crypto");
const { URL } = require("node:url");

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

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

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

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ message: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`Auth backend listening on http://localhost:${PORT}`);
});
