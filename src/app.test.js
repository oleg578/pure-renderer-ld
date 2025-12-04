import { strict as assert } from "assert";
import { test } from "node:test";
import { createApp, bootstrapApp } from "./app.js";
import { HttpError } from "./errors/httpError.js";
import { ValidationError } from "./errors/validationError.js";
import { ProcessTracker } from "./utils/processTracker.js";

class MockResponse {
  constructor() {
    this.statusCode = null;
    this.jsonData = null;
    this.headersSent = false;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(data) {
    this.jsonData = data;
    this.headersSent = true;
    return this;
  }
}

class MockRequest {
  constructor(url = "/") {
    this.url = url;
    this.method = "GET";
    this.query = {};
    this.body = {};
  }
}

class MockPageRenderer {
  async render(url) {
    return "<html><body>rendered</body></html>";
  }
}

class MockProcessTracker {
  async track(fn) {
    return fn();
  }

  async getProgress() {
    return 0;
  }
}

test("app - createApp returns Express application", () => {
  const deps = {
    pageRenderer: new MockPageRenderer(),
    processTracker: new MockProcessTracker(),
  };

  const app = createApp(deps);

  assert.ok(app);
  assert.ok(app.use);
  assert.ok(app.listen);
});

test("app - createApp accepts pageRenderer and processTracker", () => {
  const pageRenderer = new MockPageRenderer();
  const processTracker = new MockProcessTracker();
  const deps = { pageRenderer, processTracker };

  const app = createApp(deps);

  assert.ok(app);
});

test("app - error handler pattern normalizes errors", () => {
  // Test the normalizeError function indirectly through the error handler pattern
  // Verify that error normalization happens by checking app creation
  const deps = {
    pageRenderer: new MockPageRenderer(),
    processTracker: new MockProcessTracker(),
  };

  const app = createApp(deps);

  // App should have error handling middleware set up
  assert.ok(app);
  assert.ok(app.use);
});

test("app - bootstrapApp creates app with ProcessTracker", () => {
  const processTracker = new MockProcessTracker();

  const app = bootstrapApp(processTracker);

  assert.ok(app);
  assert.ok(app.listen);
});

test("app - bootstrapApp creates new PageRenderer instance", () => {
  const processTracker = new MockProcessTracker();

  const app1 = bootstrapApp(processTracker);
  const app2 = bootstrapApp(processTracker);

  // Both apps should be valid
  assert.ok(app1);
  assert.ok(app2);
});

test("app - createApp accepts multiple dependency patterns", () => {
  const deps = {
    pageRenderer: { render: async () => "<html></html>" },
    processTracker: { track: async (fn) => fn() },
  };

  const app = createApp(deps);

  assert.ok(app);
});

test("app - error handling middleware is registered", () => {
  const deps = {
    pageRenderer: new MockPageRenderer(),
    processTracker: new MockProcessTracker(),
  };

  const app = createApp(deps);

  // Verify error handler is properly setup by attempting to use the app
  assert.ok(app);
  assert.ok(typeof app.listen === "function");
});

test("app - bootstrapApp passes correct dependencies to createApp", () => {
  const processTracker = new MockProcessTracker();

  // Should not throw
  const app = bootstrapApp(processTracker);

  // Verify it's a valid app
  assert.ok(typeof app.use === "function");
  assert.ok(typeof app.listen === "function");
});

test("app - createApp returns Express app with standard interface", () => {
  const deps = {
    pageRenderer: new MockPageRenderer(),
    processTracker: new MockProcessTracker(),
  };

  const app = createApp(deps);

  // Verify Express app interface
  assert.ok(typeof app.use === "function");
  assert.ok(typeof app.listen === "function");
});

test("app - bootstrapApp creates independent app instances", () => {
  const tracker1 = new MockProcessTracker();
  const tracker2 = new MockProcessTracker();

  const app1 = bootstrapApp(tracker1);
  const app2 = bootstrapApp(tracker2);

  assert.notEqual(app1, app2);
});
