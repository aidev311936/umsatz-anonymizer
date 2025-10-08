const TOKEN_COOKIE_NAME = "umsatz_token";

declare global {
  interface Window {
    __AUTH_CONFIG__?: {
      tokenEndpoint?: string;
      sessionEndpoint?: string;
    };
  }
}

const DEFAULT_TOKEN_ENDPOINT = "/auth/token";
const DEFAULT_SESSION_ENDPOINT = "/auth/session";
let cachedTokenEndpoint: string | null = null;
let cachedSessionEndpoint: string | null = null;

function normalizeEndpointForComparison(endpoint: string): string {
  if (!endpoint) {
    return "";
  }

  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://localhost";
    const url = new URL(endpoint, base);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return endpoint.trim().replace(/\/$/, "");
  }
}

function resolveTokenEndpoint(): string {
  if (cachedTokenEndpoint) {
    return cachedTokenEndpoint;
  }

  const candidates: Array<string | null | undefined> = [];

  if (typeof window !== "undefined" && window.__AUTH_CONFIG__?.tokenEndpoint) {
    candidates.push(window.__AUTH_CONFIG__.tokenEndpoint);
  }

  const body = typeof document !== "undefined" ? document.body : null;
  if (body?.dataset?.authEndpoint) {
    candidates.push(body.dataset.authEndpoint);
  }

  const meta = typeof document !== "undefined"
    ? document.querySelector('meta[name="auth-endpoint"]')
    : null;
  if (meta) {
    candidates.push(meta.getAttribute("content"));
  }

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      cachedTokenEndpoint = trimmed;
      return trimmed;
    }
  }

  cachedTokenEndpoint = DEFAULT_TOKEN_ENDPOINT;
  return DEFAULT_TOKEN_ENDPOINT;
}

function deriveSessionEndpointFromToken(tokenEndpoint: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://localhost";
    const url = new URL(tokenEndpoint, base);
    if (url.pathname.endsWith("/token")) {
      url.pathname = url.pathname.replace(/\/token$/, "/session");
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    return new URL("/auth/session", url).toString();
  } catch {
    if (tokenEndpoint.endsWith("/token")) {
      return tokenEndpoint.replace(/\/token$/, "/session");
    }
    return DEFAULT_SESSION_ENDPOINT;
  }
}

function resolveSessionEndpoint(): string {
  if (cachedSessionEndpoint) {
    return cachedSessionEndpoint;
  }

  const candidates: Array<string | null | undefined> = [];

  if (typeof window !== "undefined" && window.__AUTH_CONFIG__?.sessionEndpoint) {
    candidates.push(window.__AUTH_CONFIG__.sessionEndpoint);
  }

  const body = typeof document !== "undefined" ? document.body : null;
  if (body?.dataset?.authSessionEndpoint) {
    candidates.push(body.dataset.authSessionEndpoint);
  }

  const meta = typeof document !== "undefined"
    ? document.querySelector('meta[name="auth-session-endpoint"]')
    : null;
  if (meta) {
    candidates.push(meta.getAttribute("content"));
  }

  const tokenEndpoint = resolveTokenEndpoint();
  const normalizedTokenEndpoint = normalizeEndpointForComparison(tokenEndpoint);

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) {
      continue;
    }

    const normalizedCandidate = normalizeEndpointForComparison(trimmed);
    if (normalizedCandidate && normalizedCandidate !== normalizedTokenEndpoint) {
      cachedSessionEndpoint = trimmed;
      return cachedSessionEndpoint;
    }
  }

  if (tokenEndpoint === DEFAULT_TOKEN_ENDPOINT) {
    cachedSessionEndpoint = DEFAULT_SESSION_ENDPOINT;
    return cachedSessionEndpoint;
  }

  cachedSessionEndpoint = deriveSessionEndpointFromToken(tokenEndpoint);
  return cachedSessionEndpoint;
}

function resolveSessionValidationEndpoint(): string {
  const tokenEndpoint = resolveTokenEndpoint();
  const normalizedTokenEndpoint = normalizeEndpointForComparison(tokenEndpoint);

  const sessionEndpoint = resolveSessionEndpoint();
  const normalizedSessionEndpoint = normalizeEndpointForComparison(sessionEndpoint);

  if (
    normalizedSessionEndpoint &&
    normalizedTokenEndpoint &&
    normalizedSessionEndpoint !== normalizedTokenEndpoint
  ) {
    return sessionEndpoint;
  }

  const derivedEndpoint = deriveSessionEndpointFromToken(tokenEndpoint);
  const normalizedDerivedEndpoint = normalizeEndpointForComparison(derivedEndpoint);

  if (
    normalizedDerivedEndpoint &&
    normalizedTokenEndpoint &&
    normalizedDerivedEndpoint !== normalizedTokenEndpoint
  ) {
    cachedSessionEndpoint = derivedEndpoint;
    return derivedEndpoint;
  }

  cachedSessionEndpoint = DEFAULT_SESSION_ENDPOINT;
  return cachedSessionEndpoint;
}

export type AuthErrorCode = "NO_TOKEN" | "INVALID_TOKEN" | "NETWORK_ERROR";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

interface TokenEndpointResult {
  token?: string;
  valid?: boolean;
  message?: string;
  maxAge?: number;
  expiresIn?: number;
  expires_in?: number;
}

export interface TokenValidationResult {
  token: string;
  message?: string;
}

function readCookie(name: string): string | null {
  const cookieString = document.cookie;
  if (!cookieString) {
    return null;
  }
  const cookies = cookieString.split(";");
  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function resolveMaxAge(result: TokenEndpointResult): number | undefined {
  if (typeof result.maxAge === "number") {
    return result.maxAge;
  }
  if (typeof result.expiresIn === "number") {
    return result.expiresIn;
  }
  if (typeof result.expires_in === "number") {
    return result.expires_in;
  }
  return undefined;
}

export function getTokenCookie(): string | null {
  return readCookie(TOKEN_COOKIE_NAME);
}

export function setTokenCookie(token: string, maxAgeSeconds?: number): void {
  const parts = [
    `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "Secure",
    "SameSite=Strict",
  ];
  if (typeof maxAgeSeconds === "number" && Number.isFinite(maxAgeSeconds)) {
    const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
    parts.push(`Max-Age=${maxAge}`);
  }
  document.cookie = parts.join("; ");
}

export function deleteTokenCookie(): void {
  document.cookie = `${TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}

async function callAuthEndpoint(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<TokenEndpointResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
  } catch {
    throw new AuthError(
      "NETWORK_ERROR",
      `Verbindung zum Authentifizierungsdienst (${endpoint}) fehlgeschlagen.`,
    );
  }

  let result: TokenEndpointResult | undefined;
  if (response.status !== 204) {
    try {
      result = (await response.json()) as TokenEndpointResult;
    } catch {
      if (response.ok) {
        // If we received a non-JSON response but the request was OK, treat it as valid.
        result = { valid: true };
      } else {
        throw new AuthError(
          "INVALID_TOKEN",
          "Antwort des Authentifizierungsdienstes konnte nicht gelesen werden.",
        );
      }
    }
  } else {
    result = { valid: response.ok };
  }

  if (!response.ok) {
    const message = result?.message ?? `Token konnte nicht validiert werden (Status ${response.status}).`;
    throw new AuthError("INVALID_TOKEN", message);
  }

  return result ?? { valid: true };
}

export async function validateToken(token: string): Promise<TokenValidationResult> {
  if (!token) {
    throw new AuthError("INVALID_TOKEN", "Es wurde kein Token übermittelt.");
  }

  const endpoint = resolveSessionValidationEndpoint();
  const result = await callAuthEndpoint(endpoint, { token });
  const isValid = result.valid ?? true;
  if (!isValid) {
    throw new AuthError(
      "INVALID_TOKEN",
      result.message ?? "Das Token ist ungültig oder abgelaufen.",
    );
  }

  const resolvedToken = result.token ?? token;
  const maxAge = resolveMaxAge(result);
  setTokenCookie(resolvedToken, maxAge);

  return {
    token: resolvedToken,
    message: result.message,
  };
}

export async function ensureAuthenticated(): Promise<string> {
  const token = getTokenCookie();
  if (!token) {
    throw new AuthError("NO_TOKEN", "Kein Zugriffstoken gefunden.");
  }
  const result = await validateToken(token);
  return result.token;
}

export async function requestNewToken(): Promise<TokenValidationResult> {
  const result = await callAuthEndpoint(resolveTokenEndpoint(), { action: "generate" });
  if (!result.token) {
    throw new AuthError(
      "INVALID_TOKEN",
      result.message ?? "Es wurde kein neues Token bereitgestellt.",
    );
  }
  const maxAge = resolveMaxAge(result);
  setTokenCookie(result.token, maxAge);
  return {
    token: result.token,
    message: result.message,
  };
}

function resolveLogoutEndpoint(): string {
  const tokenEndpoint = resolveTokenEndpoint();
  try {
    const url = new URL(tokenEndpoint, window.location.href);
    if (url.pathname.endsWith("/token")) {
      url.pathname = url.pathname.replace(/\/token$/, "/logout");
      url.search = "";
      url.hash = "";
      return url.toString();
    }
    return new URL("/auth/logout", url).toString();
  } catch {
    return "/auth/logout";
  }
}

export async function logout(): Promise<void> {
  const endpoint = resolveLogoutEndpoint();
  try {
    await fetch(endpoint, { method: "POST", credentials: "include" });
  } catch (error) {
    console.warn("Logout request failed", error);
  }
  deleteTokenCookie();
}
