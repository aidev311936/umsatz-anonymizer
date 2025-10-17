import { preview } from "vite";

const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "0.0.0.0";

const server = await preview({
  preview: {
    host,
    port,
    strictPort: true,
    open: false,
  },
});

server.printUrls();

// Keep process alive until it is terminated manually (Render sends SIGTERM).
process.stdin.resume();
