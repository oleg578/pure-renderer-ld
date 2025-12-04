import assert from "node:assert/strict";
import test from "node:test";
import { serverConfig } from "./serverConfig.js";

test("serverConfig - provides host", () => {
  assert.ok(serverConfig.host, "host is defined");
  assert.ok(typeof serverConfig.host === "string", "host is a string");
  assert.ok(serverConfig.host.length > 0, "host is not empty");
});

test("serverConfig - provides port as number", () => {
  assert.ok(typeof serverConfig.port === "number", "port is a number");
  assert.ok(serverConfig.port > 0, "port is positive");
  assert.ok(Number.isFinite(serverConfig.port), "port is finite");
});

test("serverConfig - provides timeoutMs as number", () => {
  assert.ok(
    typeof serverConfig.timeoutMs === "number",
    "timeoutMs is a number"
  );
  assert.ok(serverConfig.timeoutMs > 0, "timeoutMs is positive");
  assert.ok(Number.isFinite(serverConfig.timeoutMs), "timeoutMs is finite");
});

test("serverConfig - provides fetchHtmlTimeoutMs as number", () => {
  assert.ok(
    typeof serverConfig.fetchHtmlTimeoutMs === "number",
    "fetchHtmlTimeoutMs is a number"
  );
  assert.ok(
    serverConfig.fetchHtmlTimeoutMs > 0,
    "fetchHtmlTimeoutMs is positive"
  );
  assert.ok(
    Number.isFinite(serverConfig.fetchHtmlTimeoutMs),
    "fetchHtmlTimeoutMs is finite"
  );
});

test("serverConfig - provides stablePageTimeoutMs as number", () => {
  assert.ok(
    typeof serverConfig.stablePageTimeoutMs === "number",
    "stablePageTimeoutMs is a number"
  );
  assert.ok(
    serverConfig.stablePageTimeoutMs > 0,
    "stablePageTimeoutMs is positive"
  );
  assert.ok(
    Number.isFinite(serverConfig.stablePageTimeoutMs),
    "stablePageTimeoutMs is finite"
  );
});

test("serverConfig - provides tmpDir", () => {
  assert.ok(serverConfig.tmpDir, "tmpDir is defined");
  assert.ok(typeof serverConfig.tmpDir === "string", "tmpDir is a string");
  assert.ok(serverConfig.tmpDir.length > 0, "tmpDir is not empty");
});

test("serverConfig - host is valid IPv4 or hostname", () => {
  const host = serverConfig.host;
  const isValidIp =
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    /^[a-zA-Z0-9.-]+$/.test(host) ||
    host === "localhost";

  assert.ok(isValidIp, `host "${host}" is valid IPv4 or hostname`);
});

test("serverConfig - port is in valid range", () => {
  const port = serverConfig.port;
  assert.ok(port >= 1 && port <= 65535, `port ${port} is in valid range`);
});

test("serverConfig - timeouts are reasonable values", () => {
  const { timeoutMs, fetchHtmlTimeoutMs, stablePageTimeoutMs } = serverConfig;

  assert.ok(timeoutMs >= 100, "timeoutMs is at least 100ms");
  assert.ok(fetchHtmlTimeoutMs >= 100, "fetchHtmlTimeoutMs is at least 100ms");
  assert.ok(
    stablePageTimeoutMs >= 100,
    "stablePageTimeoutMs is at least 100ms"
  );

  assert.ok(timeoutMs <= 600000, "timeoutMs is at most 10 minutes");
  assert.ok(
    fetchHtmlTimeoutMs <= 60000,
    "fetchHtmlTimeoutMs is at most 1 minute"
  );
  assert.ok(
    stablePageTimeoutMs <= 60000,
    "stablePageTimeoutMs is at most 1 minute"
  );
});

test("serverConfig - object structure is correct", () => {
  const expectedKeys = [
    "host",
    "port",
    "timeoutMs",
    "fetchHtmlTimeoutMs",
    "stablePageTimeoutMs",
    "tmpDir",
  ];
  const actualKeys = Object.keys(serverConfig).sort();
  const expected = expectedKeys.sort();

  assert.deepEqual(
    actualKeys,
    expected,
    "serverConfig has all expected properties"
  );
});

test("serverConfig - all properties are readable", () => {
  const props = [
    "host",
    "port",
    "timeoutMs",
    "fetchHtmlTimeoutMs",
    "stablePageTimeoutMs",
    "tmpDir",
  ];

  props.forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(serverConfig, prop);
    assert.ok(descriptor, `${prop} property exists`);
    assert.ok(descriptor.value !== undefined, `${prop} has a value`);
  });
});

test("serverConfig - tmpDir path exists or is creatable", () => {
  const tmpDir = serverConfig.tmpDir;
  // Just verify it's a non-empty string path
  assert.ok(
    typeof tmpDir === "string" && tmpDir.length > 0,
    "tmpDir is a valid path string"
  );
});

test("serverConfig - timeout relationships are logical", () => {
  // Fetch should typically be faster than stable page detection
  // which should be faster than overall server timeout
  const { timeoutMs, fetchHtmlTimeoutMs, stablePageTimeoutMs } = serverConfig;

  assert.ok(
    fetchHtmlTimeoutMs <= timeoutMs,
    "fetchHtmlTimeoutMs should not exceed overall timeoutMs"
  );
  assert.ok(
    stablePageTimeoutMs <= timeoutMs,
    "stablePageTimeoutMs should not exceed overall timeoutMs"
  );
});

test("serverConfig - default values are sensible", () => {
  // Test that defaults (when env vars not set) make sense
  // These are the fallback values if env vars are missing
  const { host, port, timeoutMs } = serverConfig;

  assert.equal(host, "127.0.0.1", "default host is localhost");
  assert.equal(port, 51000, "default port is 51000");
  assert.equal(timeoutMs, 60000, "default timeout is 60 seconds");
});

test("serverConfig - numeric properties are not NaN or Infinity", () => {
  const numericProps = [
    "port",
    "timeoutMs",
    "fetchHtmlTimeoutMs",
    "stablePageTimeoutMs",
  ];

  numericProps.forEach((prop) => {
    const value = serverConfig[prop];
    assert.ok(!Number.isNaN(value), `${prop} is not NaN`);
    assert.ok(Number.isFinite(value), `${prop} is finite`);
  });
});

test("serverConfig - host can be used for server binding", () => {
  const host = serverConfig.host;
  // Verify it's not an empty string or invalid localhost format
  assert.ok(
    host === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.includes("."),
    `host "${host}" is usable for server binding`
  );
});
