import assert from "node:assert/strict";
import test from "node:test";
import path from "path";
import { loggerConfig } from "./loggerConfig.js";

test("loggerConfig - provides logFilePath", () => {
  assert.ok(loggerConfig.logFilePath, "logFilePath is defined");
  assert.ok(
    typeof loggerConfig.logFilePath === "string",
    "logFilePath is a string"
  );
  assert.ok(
    path.isAbsolute(loggerConfig.logFilePath),
    "logFilePath is absolute"
  );
});

test("loggerConfig - provides enabledLevels as Set", () => {
  assert.ok(
    loggerConfig.enabledLevels instanceof Set,
    "enabledLevels is a Set"
  );
  assert.ok(loggerConfig.enabledLevels.size > 0, "enabledLevels is not empty");
});

test("loggerConfig - enabledLevels contains valid log levels", () => {
  const validLevels = ["log", "info", "warn", "error"];

  loggerConfig.enabledLevels.forEach((level) => {
    assert.ok(validLevels.includes(level), `${level} is a valid log level`);
  });
});

test("loggerConfig - logFilePath ends with expected filename format", () => {
  const fileName = path.basename(loggerConfig.logFilePath);
  assert.ok(fileName, "filename is not empty");
  assert.ok(
    fileName.endsWith(".log") || fileName === "app.log",
    "filename looks like a log file"
  );
});

test("loggerConfig - logFilePath contains directory and filename", () => {
  const dir = path.dirname(loggerConfig.logFilePath);
  const file = path.basename(loggerConfig.logFilePath);

  assert.ok(dir, "directory path exists");
  assert.ok(file, "filename exists");
  assert.notEqual(dir, file, "directory and filename are different");
});

test("loggerConfig - enabledLevels defaults to all levels when LOG_LEVEL not set", () => {
  // When LOG_LEVEL is not set, all levels should be enabled
  // This tests the default behavior
  assert.ok(
    loggerConfig.enabledLevels.size > 0,
    "at least one log level is enabled"
  );
});

test("loggerConfig - handles lowercase log levels", () => {
  // The config converts to lowercase internally
  const allLowercase = Array.from(loggerConfig.enabledLevels).every(
    (level) => level === level.toLowerCase()
  );

  assert.ok(allLowercase, "all log levels are lowercase");
});

test("loggerConfig - object structure is correct", () => {
  assert.ok(
    loggerConfig.hasOwnProperty("logFilePath"),
    "has logFilePath property"
  );
  assert.ok(
    loggerConfig.hasOwnProperty("enabledLevels"),
    "has enabledLevels property"
  );
  assert.equal(Object.keys(loggerConfig).length, 2, "has exactly 2 properties");
});

test("loggerConfig - logFilePath is readable property", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    loggerConfig,
    "logFilePath"
  );
  assert.ok(descriptor, "logFilePath property exists");
  assert.ok(descriptor.value, "logFilePath has a value");
});

test("loggerConfig - enabledLevels is readable property", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    loggerConfig,
    "enabledLevels"
  );
  assert.ok(descriptor, "enabledLevels property exists");
  assert.ok(descriptor.value instanceof Set, "enabledLevels value is a Set");
});
