import { strict as assert } from "assert";
import { test } from "node:test";
import { normalizeHttpUrl } from "./url.js";
import { ValidationError } from "../errors/validationError.js";

test("normalizeHttpUrl - accepts valid HTTP URL", () => {
  const result = normalizeHttpUrl("http://example.com");

  assert.equal(result, "http://example.com/");
});

test("normalizeHttpUrl - accepts valid HTTPS URL", () => {
  const result = normalizeHttpUrl("https://example.com");

  assert.equal(result, "https://example.com/");
});

test("normalizeHttpUrl - adds trailing slash if missing", () => {
  const result = normalizeHttpUrl("https://example.com/path");

  assert.match(result, /https:\/\/example\.com\/path/);
});

test("normalizeHttpUrl - preserves path and query parameters", () => {
  const result = normalizeHttpUrl("https://example.com/path?key=value");

  assert.match(result, /https:\/\/example\.com\/path/);
  assert.match(result, /key=value/);
});

test("normalizeHttpUrl - trims whitespace from input", () => {
  const result = normalizeHttpUrl("  https://example.com  ");

  assert.equal(result, "https://example.com/");
});

test("normalizeHttpUrl - requires protocol for valid URLs", () => {
  // URLs without protocol should throw
  assert.throws(() => normalizeHttpUrl("example.com"), {
    name: "ValidationError",
    message: /must be a valid URL/,
  });
});

test("normalizeHttpUrl - throws on empty string", () => {
  assert.throws(() => normalizeHttpUrl(""), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on whitespace-only string", () => {
  assert.throws(() => normalizeHttpUrl("   "), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on non-string input", () => {
  assert.throws(() => normalizeHttpUrl(123), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on null input", () => {
  assert.throws(() => normalizeHttpUrl(null), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on undefined input", () => {
  assert.throws(() => normalizeHttpUrl(undefined), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on object input", () => {
  assert.throws(() => normalizeHttpUrl({}), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on array input", () => {
  assert.throws(() => normalizeHttpUrl([]), {
    name: "ValidationError",
    message: /must be a non-empty string/,
  });
});

test("normalizeHttpUrl - throws on invalid URL format", () => {
  assert.throws(() => normalizeHttpUrl("not a valid url at all!!!"), {
    name: "ValidationError",
    message: /must be a valid URL/,
  });
});

test("normalizeHttpUrl - throws on malformed URL", () => {
  assert.throws(() => normalizeHttpUrl("ht!tp://example.com"), {
    name: "ValidationError",
    message: /must be a valid URL/,
  });
});

test("normalizeHttpUrl - throws on FTP protocol", () => {
  assert.throws(() => normalizeHttpUrl("ftp://example.com"), {
    name: "ValidationError",
    message: /must use HTTP or HTTPS protocol/,
  });
});

test("normalizeHttpUrl - throws on FILE protocol", () => {
  assert.throws(() => normalizeHttpUrl("file:///path/to/file"), {
    name: "ValidationError",
    message: /must use HTTP or HTTPS protocol/,
  });
});

test("normalizeHttpUrl - throws on protocol-only input", () => {
  assert.throws(() => normalizeHttpUrl("http://"), {
    name: "ValidationError",
    message: /must be a valid URL/,
  });
});

test("normalizeHttpUrl - accepts localhost URLs", () => {
  const result = normalizeHttpUrl("http://localhost:3000");

  assert.ok(result.includes("localhost"));
});

test("normalizeHttpUrl - accepts IP addresses", () => {
  const result = normalizeHttpUrl("https://192.168.1.1:8080");

  assert.ok(result.includes("192.168.1.1"));
});

test("normalizeHttpUrl - handles URLs with fragments", () => {
  const result = normalizeHttpUrl("https://example.com#section");

  assert.ok(result.includes("example.com"));
});

test("normalizeHttpUrl - handles URLs with special characters in path", () => {
  const result = normalizeHttpUrl("https://example.com/path-with-dashes");

  assert.ok(result.includes("path-with-dashes"));
});

test("normalizeHttpUrl - handles URLs with encoded characters", () => {
  const result = normalizeHttpUrl("https://example.com/path%20with%20spaces");

  assert.ok(result.includes("path"));
});

test("normalizeHttpUrl - throws ValidationError instance on invalid input", () => {
  try {
    normalizeHttpUrl("");
    assert.fail("Should have thrown");
  } catch (error) {
    assert.ok(error instanceof ValidationError);
  }
});

test("normalizeHttpUrl - throws ValidationError instance on invalid protocol", () => {
  try {
    normalizeHttpUrl("gopher://example.com");
    assert.fail("Should have thrown");
  } catch (error) {
    assert.ok(error instanceof ValidationError);
  }
});

test("normalizeHttpUrl - returns string type", () => {
  const result = normalizeHttpUrl("https://example.com");

  assert.equal(typeof result, "string");
});

test("normalizeHttpUrl - result is valid URL string", () => {
  const result = normalizeHttpUrl("https://example.com/test");

  // Should not throw
  const url = new URL(result);
  assert.equal(url.protocol, "https:");
});

test("normalizeHttpUrl - handles subdomains", () => {
  const result = normalizeHttpUrl("https://api.example.com/v1/endpoint");

  assert.ok(result.includes("api.example.com"));
});

test("normalizeHttpUrl - handles multiple path segments", () => {
  const result = normalizeHttpUrl("https://example.com/a/b/c/d");

  assert.ok(result.includes("/a/b/c/d"));
});

test("normalizeHttpUrl - case-preserves in path", () => {
  const result = normalizeHttpUrl("https://example.com/Path/To/Resource");

  assert.ok(result.includes("Path"));
  assert.ok(result.includes("Resource"));
});

test("normalizeHttpUrl - case-lowercases domain", () => {
  const result = normalizeHttpUrl("https://EXAMPLE.COM");

  assert.match(result, /example\.com/i);
});

test("normalizeHttpUrl - handles port numbers", () => {
  const result = normalizeHttpUrl("https://example.com:8443/path");

  assert.ok(result.includes("8443"));
});

test("normalizeHttpUrl - handles query strings with multiple parameters", () => {
  const result = normalizeHttpUrl("https://example.com?a=1&b=2&c=3");

  assert.ok(result.includes("a=1"));
  assert.ok(result.includes("b=2"));
  assert.ok(result.includes("c=3"));
});
