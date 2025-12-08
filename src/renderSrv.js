import {bootstrapApp} from "./app.js";
import {serverConfig} from "./config/serverConfig.js";
import {logger} from "./services/logger.js";
import {ProcessTracker} from "./utils/processTracker.js";

const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function redirectConsoleToLogger() {
  const forward =
    (prefix, logFn, fallback) =>
    (...args) =>
      logFn(prefix, ...args).catch(() => fallback(...args));

  console.log = forward("[MESSAGE]", (...args) => logger.info(...args), nativeConsole.log);
  console.info = forward("[MESSAGE]", (...args) => logger.info(...args), nativeConsole.info);
  console.warn = forward("[ERROR]", (...args) => logger.warn(...args), nativeConsole.warn);
  console.error = forward("[ERROR]", (...args) => logger.error(...args), nativeConsole.error);
}

redirectConsoleToLogger();

const processTracker = new ProcessTracker(serverConfig.tmpDir);

// Initialize process tracker to ensure clean state on startup
processTracker.initialize().catch((error) => {
  console.error("Failed to initialize process tracker:", error);
  process.exit(1);
});

// Handle graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  try {
    await processTracker.finish();
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await processTracker.finish().catch(() => {});
  process.exit(1);
});
process.on("unhandledRejection", async (reason) => {
  console.error("Unhandled rejection:", reason);
  await processTracker.finish().catch(() => {});
  process.exit(1);
});

const app = bootstrapApp(processTracker);

const server = app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(
    `Render server listening on http://${serverConfig.host}:${serverConfig.port}`
  );
});

server.setTimeout(serverConfig.timeoutMs);
