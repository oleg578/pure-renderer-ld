import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./httpError.js";

test("HttpError - creates error with statusCode and message", () => {
  const error = new HttpError(404, "Not Found");

  assert.equal(error.statusCode, 404);
  assert.equal(error.message, "Not Found");
  assert.equal(error.name, "HttpError");
  assert.ok(error instanceof Error);
  assert.ok(error instanceof HttpError);
});

test("HttpError - preserves statusCode across different codes", () => {
  const errors = [
    { code: 400, message: "Bad Request" },
    { code: 401, message: "Unauthorized" },
    { code: 403, message: "Forbidden" },
    { code: 404, message: "Not Found" },
    { code: 500, message: "Internal Server Error" },
    { code: 503, message: "Service Unavailable" },
  ];

  errors.forEach(({ code, message }) => {
    const error = new HttpError(code, message);
    assert.equal(error.statusCode, code);
    assert.equal(error.message, message);
  });
});

test("HttpError - can be thrown and caught", () => {
  assert.throws(
    () => {
      throw new HttpError(500, "Server Error");
    },
    (err) => {
      return (
        err instanceof HttpError &&
        err.statusCode === 500 &&
        err.message === "Server Error"
      );
    }
  );
});

test("HttpError - stack trace includes error information", () => {
  const error = new HttpError(403, "Forbidden");

  assert.ok(error.stack, "error has stack trace");
  assert.ok(error.stack.includes("HttpError"), "stack includes error name");
});

test("HttpError - can be serialized to JSON", () => {
  const error = new HttpError(404, "Not Found");
  const json = JSON.stringify({
    statusCode: error.statusCode,
    message: error.message,
    name: error.name,
  });

  assert.ok(json);
  assert.ok(json.includes("404"));
  assert.ok(json.includes("Not Found"));
});

test("HttpError - error message can be empty string", () => {
  const error = new HttpError(204, "");

  assert.equal(error.statusCode, 204);
  assert.equal(error.message, "");
  assert.ok(error instanceof HttpError);
});

test("HttpError - handles special characters in message", () => {
  const specialMessage = 'Error: "Quote" & <tag> & unicode: © ™ ®';
  const error = new HttpError(400, specialMessage);

  assert.equal(error.message, specialMessage);
  assert.equal(error.statusCode, 400);
});

test("HttpError - works with very large status codes", () => {
  const error = new HttpError(599, "Custom Error");

  assert.equal(error.statusCode, 599);
  assert.equal(error.message, "Custom Error");
});

test("HttpError - maintains error properties when passed around", () => {
  const error = new HttpError(401, "Unauthorized");

  function processError(err) {
    return {
      code: err.statusCode,
      msg: err.message,
      name: err.name,
    };
  }

  const processed = processError(error);
  assert.deepEqual(processed, {
    code: 401,
    msg: "Unauthorized",
    name: "HttpError",
  });
});

test("HttpError - multiple instances are independent", () => {
  const error1 = new HttpError(404, "Not Found");
  const error2 = new HttpError(500, "Server Error");

  assert.notEqual(error1.statusCode, error2.statusCode);
  assert.notEqual(error1.message, error2.message);
  assert.equal(error1.name, error2.name);
});
