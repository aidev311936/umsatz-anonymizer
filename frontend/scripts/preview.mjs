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

const shutdown = async (signal) => {
  console.info(`\nReceived ${signal}, shutting down preview server...`);
  await server.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await new Promise(() => {
  // Intentional: keep the event loop busy until a termination signal arrives.
});
