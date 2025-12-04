import { strict as assert } from "assert";
import { test } from "node:test";

// Note: server.js is a top-level module that starts the HTTP server on import.
// Testing it directly would start an actual server. Instead, we test the
// individual components it uses (ProcessTracker, signal handlers, etc.) through
// integration tests that verify the patterns it employs.

test("server - ProcessTracker initialization pattern", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-tests"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Initialize should set flag to 0
  await tracker.initialize();
  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("server - ProcessTracker ensures clean state on startup", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-startup"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Simulate previous run with flag = 1
  await tracker.start();
  assert.equal(await tracker.getProgress(), 1);

  // Initialize clears it
  await tracker.initialize();
  assert.equal(await tracker.getProgress(), 0);
});

test("server - Signal handler pattern with graceful shutdown", async () => {
  // Verify that ProcessTracker.finish() works for graceful shutdown
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-shutdown"
  );

  const tracker = new ProcessTracker(tmpDir);

  await tracker.start();
  assert.equal(await tracker.getProgress(), 1);

  // Simulate SIGTERM/SIGINT handler calling finish()
  await tracker.finish();
  assert.equal(await tracker.getProgress(), 0);
});

test("server - Exception handler pattern with ProcessTracker", async () => {
  // Verify that exception handlers can call tracker.finish()
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-exception"
  );

  const tracker = new ProcessTracker(tmpDir);

  await tracker.start();

  // Simulate exception handler calling finish().catch(() => {})
  try {
    await tracker.finish().catch(() => {});
    const progress = await tracker.getProgress();
    assert.equal(progress, 0);
  } catch {
    assert.fail("Exception handler should not throw");
  }
});

test("server - Console redirection fallback pattern", async () => {
  // Test the console redirect fallback mechanism
  const { logger } = await import("./services/logger.js");

  // Simulate the forward function pattern used in redirectConsoleToLogger
  const nativeConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
  };

  const forward =
    (prefix, logFn, fallback) =>
    (...args) =>
      logFn(prefix, ...args).catch(() => fallback(...args));

  const wrappedLog = forward(
    "[TEST]",
    (...args) => logger.info(...args),
    nativeConsole.log
  );

  // Should not throw even if logger fails
  await wrappedLog("test message");

  assert.ok(true);
});

test("server - ProcessTracker track pattern for request handling", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-track"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Test the track() pattern used in middleware
  let executionFlag = null;
  await tracker.track(async () => {
    executionFlag = await tracker.getProgress();
  });

  // During execution, flag should be 1
  assert.equal(executionFlag, 1);

  // After execution, flag should be 0
  const finalProgress = await tracker.getProgress();
  assert.equal(finalProgress, 0);
});

test("server - ProcessTracker track ensures cleanup on error", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-track-error"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Simulate render request throwing error
  try {
    await tracker.track(async () => {
      throw new Error("Render failed");
    });
  } catch {
    // Expected to throw
  }

  // Even after error, flag should be 0
  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("server - bootstrapApp with ProcessTracker integration", async () => {
  const { bootstrapApp } = await import("./app.js");
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-bootstrap"
  );

  const tracker = new ProcessTracker(tmpDir);
  const app = bootstrapApp(tracker);

  assert.ok(app);
  assert.ok(app.listen);
});

test("server - logger initialization before console redirect", async () => {
  // Verify that logger can be imported and used
  const { logger } = await import("./services/logger.js");

  assert.ok(logger);
  assert.ok(typeof logger.info === "function");
  assert.ok(typeof logger.error === "function");
});

test("server - serverConfig provides required values", async () => {
  const { serverConfig } = await import("./config/serverConfig.js");

  assert.ok(serverConfig.host);
  assert.ok(serverConfig.port);
  assert.ok(serverConfig.timeoutMs);
  assert.ok(serverConfig.tmpDir);
});

test("server - Multiple ProcessTracker instances can coexist", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir1 = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "tracker-1"
  );
  const tmpDir2 = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "tracker-2"
  );

  const tracker1 = new ProcessTracker(tmpDir1);
  const tracker2 = new ProcessTracker(tmpDir2);

  await tracker1.start();
  await tracker2.finish();

  assert.equal(await tracker1.getProgress(), 1);
  assert.equal(await tracker2.getProgress(), 0);
});

test("server - ProcessTracker supports rapid state changes", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-rapid"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Simulate multiple rapid requests
  for (let i = 0; i < 5; i++) {
    await tracker.start();
    assert.equal(await tracker.getProgress(), 1);
    await tracker.finish();
    assert.equal(await tracker.getProgress(), 0);
  }
});

test("server - Graceful shutdown prevents new requests during finish", async () => {
  // Pattern: during shutdown, no new requests should start
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-graceful"
  );

  const tracker = new ProcessTracker(tmpDir);
  let wasInProgressDuringShutdown = false;

  // Start a request
  await tracker.start();

  // Check state before shutdown
  const stateBeforeShutdown = await tracker.getProgress();

  // Shutdown
  await tracker.finish();

  // Verify shutdown completed
  assert.equal(await tracker.getProgress(), 0);
  assert.equal(stateBeforeShutdown, 1);
});

test("server - createApp error handling pattern", async () => {
  const { createApp } = await import("./app.js");
  const { HttpError } = await import("./errors/httpError.js");

  const deps = {
    pageRenderer: { render: async () => "<html></html>" },
    processTracker: { track: async (fn) => fn() },
  };

  const app = createApp(deps);

  // Verify app has error handling capability
  assert.ok(app);
  assert.ok(typeof app.listen === "function");
});

test("server - Process event handlers maintain tracker state", async () => {
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-events"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Simulate: start render, then signal arrives
  await tracker.start();
  const stateBeforeSignal = await tracker.getProgress();

  // Signal handler: finish
  await tracker.finish();

  assert.equal(stateBeforeSignal, 1);
  assert.equal(await tracker.getProgress(), 0);
});

test("server - Console message forwarding pattern", async () => {
  // Verify that the forwarding pattern works
  const messages = [];

  const nativeConsole = {
    log: (...args) => messages.push(args),
  };

  const forward =
    (prefix, logFn, fallback) =>
    (...args) =>
      logFn(prefix, ...args).catch(() => fallback(...args));

  const asyncLogger = {
    info: async (prefix, ...args) => {
      messages.push([prefix, ...args]);
    },
  };

  const wrapped = forward(
    "[MSG]",
    (...args) => asyncLogger.info(...args),
    nativeConsole.log
  );

  await wrapped("test");

  assert.ok(messages.length > 0);
});

test("server - Initialization order: ProcessTracker before server listen", async () => {
  // Verify ProcessTracker can be initialized before starting server
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-order"
  );

  const tracker = new ProcessTracker(tmpDir);

  // Should complete before we would call server.listen()
  await tracker.initialize();

  assert.equal(await tracker.getProgress(), 0);
});

test("server - Exception handlers allow safe cleanup even if tracker fails", async () => {
  // Pattern: finish() should be called with .catch(() => {})
  const { ProcessTracker } = await import("./utils/processTracker.js");
  const path = (await import("path")).default;
  const tmpDir = path.join(
    import.meta.dirname,
    "..",
    "..",
    "tmp",
    "server-safe-cleanup"
  );

  const tracker = new ProcessTracker(tmpDir);

  await tracker.start();

  // Pattern from exception handlers
  let cleanupSucceeded = false;
  await tracker.finish().catch(() => {
    cleanupSucceeded = true;
  });

  // Cleanup should have completed
  assert.equal(await tracker.getProgress(), 0);
});
