import { strict as assert } from "assert";
import { test } from "node:test";
import { promises as fs } from "fs";
import path from "path";
import { Logger } from "./logger.js";

const tmpDir = path.join(
  import.meta.dirname,
  "..",
  "..",
  "tmp",
  "logger-tests"
);

test("Logger - constructor initializes properties", () => {
  const config = {
    logFilePath: "/tmp/test.log",
    enabledLevels: ["log", "warn"],
  };
  const logger = new Logger(config);

  assert.equal(logger.logFilePath, "/tmp/test.log");
  assert.deepEqual(logger.enabledLevels, new Set(["log", "warn"]));
  assert.equal(logger.ensureDirPromise, undefined);
});

test("Logger - log method writes to file when level enabled", async () => {
  const logFile = path.join(tmpDir, "test-log.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  await logger.log("test message");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /\[LOG\] test message/);
});

test("Logger - info method writes to file when enabled", async () => {
  const logFile = path.join(tmpDir, "test-info.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["info"],
  };
  const logger = new Logger(config);

  await logger.info("info message");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /\[INFO\] info message/);
});

test("Logger - warn method writes to file when enabled", async () => {
  const logFile = path.join(tmpDir, "test-warn.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["warn"],
  };
  const logger = new Logger(config);

  await logger.warn("warning message");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /\[WARN\] warning message/);
});

test("Logger - error method writes to file when enabled", async () => {
  const logFile = path.join(tmpDir, "test-error.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["error"],
  };
  const logger = new Logger(config);

  await logger.error("error message");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /\[ERROR\] error message/);
});

test("Logger - skips logging when level not enabled", async () => {
  const logFile = path.join(tmpDir, "test-filtered.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["error"],
  };
  const logger = new Logger(config);

  await logger.log("should be skipped");
  await logger.info("should also be skipped");
  await logger.error("should be included");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /should be included/);
  assert.doesNotMatch(content, /should be skipped/);
});

test("Logger - write method ignores invalid log levels", async () => {
  const logFile = path.join(tmpDir, "test-invalid-level.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log", "info", "warn", "error"],
  };
  const logger = new Logger(config);

  await logger.write("invalid", ["message"]);
  await logger.log("valid");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /valid/);
  assert.doesNotMatch(content, /message/);
});

test("Logger - ensureLogDirectory creates nested directories", async () => {
  const logFile = path.join(tmpDir, "deeply", "nested", "path", "test.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  await logger.ensureLogDirectory();

  const dirStat = await fs.stat(path.dirname(logFile));
  assert.ok(dirStat.isDirectory());
});

test("Logger - ensureLogDirectory caches promise for efficiency", async () => {
  const logFile = path.join(tmpDir, "cached-unique", "path", "test.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  // The first call should be undefined (no cache)
  assert.equal(logger.ensureDirPromise, undefined);

  await logger.ensureLogDirectory();

  // After first call, should have cached a promise
  const firstCachePromise = logger.ensureDirPromise;
  assert.ok(firstCachePromise);

  // Call again - should return cached promise
  await logger.ensureLogDirectory();
  const secondCachePromise = logger.ensureDirPromise;

  // Both cached promises should be the same
  assert.strictEqual(firstCachePromise, secondCachePromise);
});

test("Logger - ensureLogDirectory resets cache on error", async () => {
  const config = {
    logFilePath: "/invalid/cannot/create/this/path/deep/test.log",
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  try {
    await logger.ensureLogDirectory();
  } catch (error) {
    assert.ok(error);
  }

  // Cache should be cleared
  assert.equal(logger.ensureDirPromise, undefined);
});

test("Logger - formatEntry includes timestamp and level", () => {
  const config = {
    logFilePath: "/tmp/test.log",
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  const entry = logger.formatEntry("info", ["test", "message"]);

  assert.match(entry, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(entry, /\[INFO\]/);
  assert.match(entry, /test message/);
  assert.match(entry, /\n$/);
});

test("Logger - formatEntry formats multiple arguments", () => {
  const config = {
    logFilePath: "/tmp/test.log",
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  const obj = { key: "value" };
  const entry = logger.formatEntry("warn", ["msg", obj, 123]);

  assert.match(entry, /msg/);
  assert.match(entry, /key: 'value'/);
  assert.match(entry, /123/);
});

test("Logger - appends multiple entries to same file", async () => {
  const logFile = path.join(tmpDir, "multi-entry-unique.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log", "info", "error"],
  };
  const logger = new Logger(config);

  await logger.log("first");
  await logger.info("second");
  await logger.error("third");

  const content = await fs.readFile(logFile, "utf-8");
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  // Should have at least 3 entries for our messages
  assert.ok(lines.length >= 3);

  // Check that all three messages are in the file
  const fullContent = content;
  assert.match(fullContent, /first/);
  assert.match(fullContent, /second/);
  assert.match(fullContent, /third/);
});

test("Logger - handles logging empty strings", async () => {
  const logFile = path.join(tmpDir, "empty-string.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  await logger.log("");

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /\[LOG\]/);
});

test("Logger - handles logging complex objects", async () => {
  const logFile = path.join(tmpDir, "complex-object.log");
  const config = {
    logFilePath: logFile,
    enabledLevels: ["log"],
  };
  const logger = new Logger(config);

  const complexObj = {
    nested: { deep: { value: 123 } },
    array: [1, 2, 3],
  };

  await logger.log(complexObj);

  const content = await fs.readFile(logFile, "utf-8");
  assert.match(content, /nested/);
  assert.match(content, /deep/);
});
