const http = require("node:http");
const { createPool, createDb } = require("./db");
const { createApp } = require("./app");

async function start() {
  const port = parseInt(process.env.PORT ?? "8080", 10);
  const pool = createPool();
  const db = createDb(pool);
  const app = createApp({ db });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Backend server listening on port ${port}`);

  const shutdown = () => {
    console.log("Shutting down backend server");
    server.close(() => {
      pool.end().catch((error) => {
        console.error("Failed to close database pool", error);
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Failed to start backend server", error);
  process.exitCode = 1;
});
