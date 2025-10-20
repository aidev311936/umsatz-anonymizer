import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

function normalizeBaseUrl(value?: string): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/$/, "");
}

const renderExternalHost = process.env.RENDER_EXTERNAL_HOSTNAME;
const additionalPreviewHosts = process.env.PREVIEW_ALLOWED_HOSTS?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const previewAllowedHosts = [
  renderExternalHost,
  ...(additionalPreviewHosts ?? []),
].filter(Boolean) as string[];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendBaseUrl =
    normalizeBaseUrl(env.VITE_BACKEND_BASE_URL) || normalizeBaseUrl(env.BACKEND_BASE_URL);

  return {
    plugins: [
      vue(),
      {
        name: "inject-backend-base-url-meta",
        transformIndexHtml(html) {
          if (!backendBaseUrl) {
            return html;
          }

          const metaTagPattern = /<meta\s+name=["']backend-base-url["']\s+content=["'][^"']*["']\s*\/?>(?:\s*)/i;
          if (metaTagPattern.test(html)) {
            return html.replace(
              metaTagPattern,
              `<meta name="backend-base-url" content="${backendBaseUrl}" />`,
            );
          }

          return html.replace(
            /(<head[^>]*>)/i,
            `$1\n    <meta name="backend-base-url" content="${backendBaseUrl}" />`,
          );
        },
      },
    ],
    define: {
      __BACKEND_BASE_URL__: JSON.stringify(backendBaseUrl ?? ""),
    },
    envPrefix: ["VITE_", "BACKEND_"],
    server: {
      port: 5173,
      host: "0.0.0.0",
    },
    preview: {
      ...(previewAllowedHosts.length > 0
        ? { allowedHosts: previewAllowedHosts }
        : {}),
    },
  };
});
