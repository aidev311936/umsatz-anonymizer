const TOKEN_COOKIE_NAME = "umsatz_token";
const DEFAULT_TOKEN_ENDPOINT = "/auth/token";
let cachedTokenEndpoint = null;
function resolveTokenEndpoint() {
    if (cachedTokenEndpoint) {
        return cachedTokenEndpoint;
    }
    const candidates = [];
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
export class AuthError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "AuthError";
        this.code = code;
    }
}
function readCookie(name) {
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
function resolveMaxAge(result) {
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
export function getTokenCookie() {
    return readCookie(TOKEN_COOKIE_NAME);
}
export function setTokenCookie(token, maxAgeSeconds) {
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
export function deleteTokenCookie() {
    document.cookie = `${TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}
async function callTokenEndpoint(payload) {
    const endpoint = resolveTokenEndpoint();
    let response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "include",
        });
    }
    catch {
        throw new AuthError("NETWORK_ERROR", `Verbindung zum Authentifizierungsdienst (${endpoint}) fehlgeschlagen.`);
    }
    let result;
    if (response.status !== 204) {
        try {
            result = (await response.json());
        }
        catch {
            if (response.ok) {
                // If we received a non-JSON response but the request was OK, treat it as valid.
                result = { valid: true };
            }
            else {
                throw new AuthError("INVALID_TOKEN", "Antwort des Authentifizierungsdienstes konnte nicht gelesen werden.");
            }
        }
    }
    else {
        result = { valid: response.ok };
    }
    if (!response.ok) {
        const message = result?.message ?? `Token konnte nicht validiert werden (Status ${response.status}).`;
        throw new AuthError("INVALID_TOKEN", message);
    }
    return result ?? { valid: true };
}
export async function validateToken(token) {
    if (!token) {
        throw new AuthError("INVALID_TOKEN", "Es wurde kein Token übermittelt.");
    }
    const result = await callTokenEndpoint({ token });
    const isValid = result.valid ?? true;
    if (!isValid) {
        throw new AuthError("INVALID_TOKEN", result.message ?? "Das Token ist ungültig oder abgelaufen.");
    }
    const resolvedToken = result.token ?? token;
    const maxAge = resolveMaxAge(result);
    setTokenCookie(resolvedToken, maxAge);
    return {
        token: resolvedToken,
        message: result.message,
    };
}
export async function ensureAuthenticated() {
    const token = getTokenCookie();
    if (!token) {
        throw new AuthError("NO_TOKEN", "Kein Zugriffstoken gefunden.");
    }
    const result = await validateToken(token);
    return result.token;
}
export async function requestNewToken() {
    const result = await callTokenEndpoint({ action: "generate" });
    if (!result.token) {
        throw new AuthError("INVALID_TOKEN", result.message ?? "Es wurde kein neues Token bereitgestellt.");
    }
    const maxAge = resolveMaxAge(result);
    setTokenCookie(result.token, maxAge);
    return {
        token: result.token,
        message: result.message,
    };
}
