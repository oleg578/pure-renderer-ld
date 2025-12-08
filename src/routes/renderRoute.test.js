import assert from "node:assert/strict";
import test from "node:test";
import { createRenderRouter } from "./renderRoute.js";
import { ValidationError } from "../errors/validationError.js";

// Mock implementations for testing
class MockPageRenderer {
  constructor(shouldError = false) {
    this.shouldError = shouldError;
    this.renderCalls = [];
  }

  async render(url) {
    this.renderCalls.push(url);
    if (this.shouldError) {
      throw new Error("Render failed");
    }
    return `<html><body>Rendered: ${url}</body></html>`;
  }
}

class MockProcessTracker {
  constructor() {
    this.trackCalls = [];
    this.progressValue = 0;
    this.shouldError = false;
  }

  async track(fn) {
    this.trackCalls.push(fn);
    if (this.shouldError) {
      throw new Error("Track failed");
    }
    return await fn();
  }

  async getProgress() {
    if (this.shouldError) {
      throw new Error("Get progress failed");
    }
    return this.progressValue;
  }
}

class MockRequest {
  constructor(query = {}) {
    this.query = query;
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.contentType = null;
    this.data = null;
    this.headers = {};
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  type(contentType) {
    this.contentType = contentType;
    return this;
  }

  send(data) {
    this.data = data;
    return this;
  }

  json(data) {
    this.data = data;
    this.contentType = "application/json";
    return this;
  }
}

class MockNext {
  constructor() {
    this.error = null;
    this.called = false;
  }

  call(error) {
    this.called = true;
    this.error = error;
  }
}

test("createRenderRouter - returns an Express router", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  assert.ok(router, "router is returned");
  assert.ok(typeof router.get === "function", "router has get method");
  assert.ok(typeof router.use === "function", "router has use method");
  assert.ok(router.stack, "router has stack property");
});

test("createRenderRouter - creates /render endpoint", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  assert.ok(router.stack, "router has stack");
  const renderRoute = router.stack.find(
    (layer) => layer.route?.path === "/render"
  );
  assert.ok(renderRoute, "/render route is registered");
});

test("createRenderRouter - creates /progress endpoint", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  assert.ok(router.stack, "router has stack");
  const progressRoute = router.stack.find(
    (layer) => layer.route?.path === "/progress"
  );
  assert.ok(progressRoute, "/progress route is registered");
});

test("createRenderRouter /render - returns HTML with 200 status", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "https://example.com" });
  const res = new MockResponse();
  const next = new MockNext();

  // Get the render handler
  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.equal(res.statusCode, 200, "status is 200");
  assert.equal(res.contentType, "text/html", "content type is text/html");
  assert.ok(res.data, "data is returned");
  assert.ok(res.data.includes("Rendered"), "response contains rendered HTML");
  assert.ok(!next.called, "next was not called");
});

test("createRenderRouter /render - tracks render execution", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "https://example.com" });
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.equal(processTracker.trackCalls.length, 1, "track was called once");
  assert.equal(pageRenderer.renderCalls.length, 1, "render was called once");
  assert.equal(
    pageRenderer.renderCalls[0],
    "https://example.com/",
    "render was called with normalized URL"
  );
});

test("createRenderRouter /render - calls next with error on invalid URL", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "not-a-url" });
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.ok(next.called, "next was called with error");
  assert.ok(next.error, "error was passed to next");
  assert.ok(
    next.error instanceof ValidationError || next.error instanceof Error,
    "error is a ValidationError or Error"
  );
});

test("createRenderRouter /render - calls next when render throws", async () => {
  const pageRenderer = new MockPageRenderer(true); // Will throw
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "https://example.com" });
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.ok(next.called, "next was called");
  assert.ok(next.error, "error was passed");
});

test("createRenderRouter /render - handles missing URL query parameter", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({}); // No url parameter
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.ok(next.called, "next was called");
  assert.ok(next.error instanceof ValidationError, "error is ValidationError");
});

test("createRenderRouter /progress - returns progress as JSON", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  processTracker.progressValue = 1;
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest();
  const res = new MockResponse();
  const next = new MockNext();

  // Get the progress handler (second route)
  const progressHandler = router.stack[1].route.stack[0].handle;
  await progressHandler(req, res, (err) => next.call(err));

  assert.equal(res.statusCode, 200, "status is 200");
  assert.equal(res.contentType, "application/json", "content type is JSON");
  assert.ok(res.data.progress !== undefined, "progress is in response");
  assert.equal(res.data.progress, 1, "progress value is correct");
  assert.ok(!next.called, "next was not called");
});

test("createRenderRouter /progress - returns 0 when not rendering", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  processTracker.progressValue = 0;
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest();
  const res = new MockResponse();
  const next = new MockNext();

  const progressHandler = router.stack[1].route.stack[0].handle;
  await progressHandler(req, res, (err) => next.call(err));

  assert.equal(res.data.progress, 0, "progress is 0");
});

test("createRenderRouter /progress - calls next on error", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  processTracker.shouldError = true;
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest();
  const res = new MockResponse();
  const next = new MockNext();

  const progressHandler = router.stack[1].route.stack[0].handle;
  await progressHandler(req, res, (err) => next.call(err));

  assert.ok(next.called, "next was called");
  assert.ok(next.error, "error was passed");
});

test("createRenderRouter - /render uses GET method", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const renderRoute = router.stack[0].route.path;
  const renderMethods = router.stack[0].route.methods;

  assert.equal(renderRoute, "/render", "route path is /render");
  assert.ok(renderMethods.get, "route accepts GET method");
});

test("createRenderRouter - /progress uses GET method", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const progressRoute = router.stack[1].route.path;
  const progressMethods = router.stack[1].route.methods;

  assert.equal(progressRoute, "/progress", "route path is /progress");
  assert.ok(progressMethods.get, "route accepts GET method");
});

test("createRenderRouter - /progress ignores request body", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest();
  req.body = { someData: "should be ignored" }; // Progress doesn't use request body
  const res = new MockResponse();
  const next = new MockNext();

  const progressHandler = router.stack[1].route.stack[0].handle;
  await progressHandler(req, res, (err) => next.call(err));

  assert.ok(!next.called, "next was not called despite request body");
  assert.equal(res.statusCode, 200, "request succeeds");
});

test("createRenderRouter - handles HTTPS URLs", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "https://secure.example.com/path" });
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  assert.ok(!next.called, "next was not called");
  assert.equal(res.statusCode, 200, "HTTPS URL is accepted");
});

test("createRenderRouter - normalizes URLs (adds trailing slash)", async () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const router = createRenderRouter(pageRenderer, processTracker);

  const req = new MockRequest({ url: "https://example.com" });
  const res = new MockResponse();
  const next = new MockNext();

  const renderHandler = router.stack[0].route.stack[0].handle;
  await renderHandler(req, res, (err) => next.call(err));

  // normalizeHttpUrl adds trailing slash
  assert.equal(
    pageRenderer.renderCalls[0],
    "https://example.com/",
    "URL is normalized"
  );
});
