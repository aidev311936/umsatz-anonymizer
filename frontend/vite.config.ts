import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const renderExternalHost = process.env.RENDER_EXTERNAL_HOSTNAME;
const additionalPreviewHosts = process.env.PREVIEW_ALLOWED_HOSTS?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const previewAllowedHosts = [
  renderExternalHost,
  ...(additionalPreviewHosts ?? []),
].filter(Boolean) as string[];

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  preview: {
    ...(previewAllowedHosts.length > 0
      ? { allowedHosts: previewAllowedHosts }
      : {}),
  },
});
