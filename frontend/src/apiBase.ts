declare global {
  interface Window {
    BACKEND_BASE_URL?: string;
  }
}

declare const __BACKEND_BASE_URL__: string | undefined;

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/$/, "");
}

export function resolveApiBase(): string {
  const buildTimeValue =
    typeof __BACKEND_BASE_URL__ !== "undefined" ? normalizeBaseUrl(__BACKEND_BASE_URL__) : "";
  if (buildTimeValue) {
    return buildTimeValue;
  }

  const envValue = normalizeBaseUrl(
    import.meta.env?.VITE_BACKEND_BASE_URL ?? import.meta.env?.BACKEND_BASE_URL,
  );
  if (envValue) {
    return envValue;
  }

  if (typeof window !== "undefined") {
    const windowValue = normalizeBaseUrl(window.BACKEND_BASE_URL);
    if (windowValue) {
      return windowValue;
    }
  }

  const meta = typeof document !== "undefined" ? document.querySelector('meta[name="backend-base-url"]') : null;
  const metaValue = normalizeBaseUrl(meta?.getAttribute("content"));
  if (metaValue) {
    return metaValue;
  }

  return "";
}

let cachedApiBaseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (cachedApiBaseUrl && cachedApiBaseUrl.length > 0) {
    return cachedApiBaseUrl;
  }

  const resolved = resolveApiBase();
  if (resolved) {
    cachedApiBaseUrl = resolved;
  }

  return cachedApiBaseUrl ?? "";
}

export function __clearApiBaseCacheForTests(): void {
  cachedApiBaseUrl = null;
}
