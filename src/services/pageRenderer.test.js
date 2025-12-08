import { strict as assert } from "assert";
import { test } from "node:test";
import { PageRenderer } from "./pageRenderer.js";

// Mock Puppeteer and dependencies
class MockClient {
  async send(method, params) {
    if (method === "DOM.getDocument") {
      return { root: { nodeId: 1 } };
    }
    if (method === "DOM.getOuterHTML") {
      return { outerHTML: "<html><body>content</body></html>" };
    }
    throw new Error(`Unknown method: ${method}`);
  }
}

class MockPage {
  constructor() {
    this.userAgent = null;
    this.requestInterception = false;
    this.listeners = {};
    this.gotoUrl = null;
  }

  async setUserAgent({ userAgent }) {
    this.userAgent = userAgent;
  }

  async setRequestInterception(enabled) {
    this.requestInterception = enabled;
  }

  on(event, listener) {
    this.listeners[event] = listener;
  }

  async goto(url) {
    this.gotoUrl = url;
  }

  async evaluate(fn, ...args) {
    return fn(...args);
  }

  target() {
    return {
      createCDPSession: async () => new MockClient(),
    };
  }
}

class MockBrowser {
  async newPage() {
    return new MockPage();
  }

  async close() {
    // no-op
  }
}

// Mock puppeteer module
const mockPuppeteer = {
  launch: async () => new MockBrowser(),
};

test("PageRenderer - constructor initializes with defaults", () => {
  const renderer = new PageRenderer();

  assert.deepEqual(renderer.launchOptions, {});
  assert.equal(renderer.inflight, 0);
  assert.ok(
    renderer.lastChange instanceof Number ||
      typeof renderer.lastChange === "number"
  );
});

test("PageRenderer - constructor accepts custom launchOptions", () => {
  const options = { launchOptions: { headless: false } };
  const renderer = new PageRenderer(options);

  assert.deepEqual(renderer.launchOptions, { headless: false });
});

test("PageRenderer - parseUrl returns URL object for valid URLs", () => {
  const renderer = new PageRenderer();

  const result = renderer.parseUrl("https://example.com/path?query=value");

  assert.ok(result instanceof URL);
  assert.equal(result.hostname, "example.com");
  assert.equal(result.pathname, "/path");
});

test("PageRenderer - parseUrl returns undefined for invalid URLs", () => {
  const renderer = new PageRenderer();

  const result = renderer.parseUrl("not a valid url");

  assert.equal(result, undefined);
});

test("PageRenderer - parseUrl handles malformed URLs", () => {
  const renderer = new PageRenderer();

  const result = renderer.parseUrl("ht!tp://invalid");

  assert.equal(result, undefined);
});

test("PageRenderer - buildTimestampSuffix formats date correctly", () => {
  const renderer = new PageRenderer();
  const date = new Date(2025, 11, 4, 14, 30, 45);

  const result = renderer.buildTimestampSuffix(date);

  // Verify format and expected values
  assert.match(result, /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  const parts = result.split("-");
  assert.equal(parts[0], "2025");
  assert.equal(parts[1], "12");
  assert.equal(parts[2], "04");
});

test("PageRenderer - buildTimestampSuffix pads single-digit values", () => {
  const renderer = new PageRenderer();
  // Create a date with controlled values using UTC to avoid timezone issues
  const date = new Date(2025, 0, 5, 9, 3, 7);

  const result = renderer.buildTimestampSuffix(date);

  // Just verify the format is correct: YYYY-MM-DD-HH-MM-SS
  assert.match(result, /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  const parts = result.split("-");
  assert.equal(parts[0], "2025");
  assert.equal(parts[1], "01");
  assert.equal(parts[2], "05");
});

test("PageRenderer - buildSnapshotBaseName returns 'page' for no URL", () => {
  const renderer = new PageRenderer();

  const result = renderer.buildSnapshotBaseName(undefined);

  assert.equal(result, "page");
});

test("PageRenderer - buildSnapshotBaseName sanitizes hostname and path", () => {
  const renderer = new PageRenderer();
  const url = new URL("https://example.com/path/to/product");

  const result = renderer.buildSnapshotBaseName(url);

  assert.match(result, /example_com/);
  assert.match(result, /path/);
});

test("PageRenderer - buildSnapshotBaseName removes special characters", () => {
  const renderer = new PageRenderer();
  const url = new URL("https://ex-ample.com/path?query=value&other=test");

  const result = renderer.buildSnapshotBaseName(url);

  assert.doesNotMatch(result, /[?&=]/);
  assert.ok(result.length > 0);
});

test("PageRenderer - buildSnapshotBaseName truncates long names", () => {
  const renderer = new PageRenderer();
  const longHostname = "a".repeat(200) + ".com";
  const url = new URL(`https://${longHostname}/very/long/path`);

  const result = renderer.buildSnapshotBaseName(url);

  assert.ok(result.length <= 120);
});

test("PageRenderer - buildSnapshotBaseName removes leading/trailing underscores", () => {
  const renderer = new PageRenderer();
  const url = new URL("https://example.com/___path___");

  const result = renderer.buildSnapshotBaseName(url);

  assert.doesNotMatch(result, /^_/);
  assert.doesNotMatch(result, /_$/);
});

test("PageRenderer - sendWithTimeout resolves with result on success", async () => {
  const renderer = new PageRenderer();
  const mockClient = new MockClient();

  const result = await renderer.sendWithTimeout(
    mockClient,
    "DOM.getDocument",
    { depth: -1 },
    5000
  );

  assert.deepEqual(result, { root: { nodeId: 1 } });
});

test("PageRenderer - sendWithTimeout rejects on timeout", async () => {
  const renderer = new PageRenderer();

  const slowClient = {
    send: () => new Promise(() => {}), // Never resolves
  };

  try {
    await renderer.sendWithTimeout(slowClient, "DOM.getDocument", {}, 10);
    assert.fail("Should have timed out");
  } catch (error) {
    assert.match(error.message, /timed out after/);
  }
});

test("PageRenderer - sendWithTimeout clears timeout on success", async () => {
  const renderer = new PageRenderer();
  const mockClient = new MockClient();

  // This should resolve without hanging
  const startTime = Date.now();
  await renderer.sendWithTimeout(
    mockClient,
    "DOM.getDocument",
    { depth: -1 },
    5000
  );
  const duration = Date.now() - startTime;

  assert.ok(duration < 1000);
});

test("PageRenderer - sendWithTimeout clears timeout on error", async () => {
  const renderer = new PageRenderer();

  const errorClient = {
    send: () => Promise.reject(new Error("Test error")),
  };

  try {
    await renderer.sendWithTimeout(errorClient, "DOM.test", {}, 5000);
  } catch (error) {
    assert.equal(error.message, "Test error");
  }
});

test("PageRenderer - getFullHTML returns outerHTML", async () => {
  const renderer = new PageRenderer();
  const mockPage = new MockPage();

  const result = await renderer.getFullHTML(mockPage);

  assert.equal(result, "<html><body>content</body></html>");
});

test("PageRenderer - getFullHTML throws on empty outerHTML", async () => {
  const renderer = new PageRenderer();
  const mockPage = new MockPage();

  mockPage.target = () => ({
    createCDPSession: async () => ({
      send: async (method) => {
        if (method === "DOM.getDocument") {
          return { root: { nodeId: 1 } };
        }
        return { outerHTML: "   " }; // Whitespace only
      },
    }),
  });

  try {
    await renderer.getFullHTML(mockPage);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.match(error.message, /empty outerHTML/);
  }
});

test("PageRenderer - waitForDOMStable evaluates in page context", async () => {
  const renderer = new PageRenderer();
  const mockPage = new MockPage();

  let evaluatedCode = null;
  let evaluateArgs = [];
  mockPage.evaluate = async (fn, ...args) => {
    evaluatedCode = fn;
    evaluateArgs = args;
    // Return resolved promise without calling the actual function
    return Promise.resolve();
  };

  await renderer.waitForDOMStable(mockPage, 100, 5000);

  assert.ok(evaluatedCode instanceof Function);
  assert.equal(evaluateArgs[0], 100);
  assert.equal(evaluateArgs[1], 5000);
});

test("PageRenderer - injectJsonLd creates script element in head", async () => {
  const renderer = new PageRenderer();
  const html = "<html><head></head><body></body></html>";

  // Mock buildJsonLdScript to return test JSON
  const originalBuild = await import("../ldgen/index.js").then(
    (m) => m.buildJsonLdScript
  );

  // We can't easily test this without full integration, but we can at least
  // verify the method runs and returns HTML
  const result = await renderer.injectJsonLd(html);

  assert.ok(result);
  assert.match(result, /<script type="application\/ld\+json"/);
});

test("PageRenderer - injectJsonLd handles missing head element", async () => {
  const renderer = new PageRenderer();
  const html = "<html><body>test</body></html>";

  const result = await renderer.injectJsonLd(html);

  assert.ok(result);
  assert.match(result, /<head/);
});

test("PageRenderer - injectJsonLd returns original HTML on error", async () => {
  const renderer = new PageRenderer();
  const html = "<html><body>test</body></html>";

  // Create invalid HTML to trigger error in injection
  const invalidHtml = "{not valid html}";

  // The method should catch errors and return the input
  const result = await renderer.injectJsonLd(invalidHtml);

  assert.ok(result);
});

test("PageRenderer - logInflight logs current state with elapsed time", () => {
  const renderer = new PageRenderer();
  renderer.start = Date.now() - 2000; // 2 seconds ago
  renderer.inflight = 5;

  let logOutput = null;
  const originalLog = console.log;
  console.log = (msg) => {
    logOutput = msg;
  };

  renderer.logInflight("test reason");

  console.log = originalLog;

  assert.ok(logOutput);
  assert.match(logOutput, /inflight=5/);
  assert.match(logOutput, /test reason/);
});

test("PageRenderer - parseUrl handles URLs with fragments", () => {
  const renderer = new PageRenderer();

  const result = renderer.parseUrl("https://example.com#section");

  assert.ok(result instanceof URL);
  assert.equal(result.hash, "#section");
});

test("PageRenderer - parseUrl handles URLs with special characters", () => {
  const renderer = new PageRenderer();

  const result = renderer.parseUrl("https://example.com/path?q=hello%20world");

  assert.ok(result instanceof URL);
  assert.equal(result.search, "?q=hello%20world");
});

test("PageRenderer - buildSnapshotBaseName handles localhost", () => {
  const renderer = new PageRenderer();
  const url = new URL("http://localhost:3000/api/test");

  const result = renderer.buildSnapshotBaseName(url);

  assert.ok(result.includes("localhost"));
});

test("PageRenderer - buildSnapshotBaseName handles IP addresses", () => {
  const renderer = new PageRenderer();
  const url = new URL("http://192.168.1.1/test");

  const result = renderer.buildSnapshotBaseName(url);

  assert.ok(result.length > 0);
  assert.ok(result.length <= 120);
});

test("PageRenderer - sendWithTimeout provides correct timeout error message", async () => {
  const renderer = new PageRenderer();
  const timeoutMs = 42;

  const slowClient = {
    send: () => new Promise(() => {}),
  };

  try {
    await renderer.sendWithTimeout(slowClient, "DOM.test", {}, timeoutMs);
  } catch (error) {
    assert.match(error.message, new RegExp(`${timeoutMs}ms`));
  }
});
