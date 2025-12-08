import assert from "node:assert/strict";
import test from "node:test";
import { ValidationError } from "./validationError.js";
import { HttpError } from "./httpError.js";

test("ValidationError - creates error with 400 status code", () => {
  const error = new ValidationError("Invalid input");

  assert.equal(error.statusCode, 400);
  assert.equal(error.message, "Invalid input");
  assert.equal(error.name, "ValidationError");
});

test("ValidationError - is instance of both ValidationError and HttpError", () => {
  const error = new ValidationError("Invalid data");

  assert.ok(error instanceof ValidationError);
  assert.ok(error instanceof HttpError);
  assert.ok(error instanceof Error);
});

test("ValidationError - always uses 400 status code regardless of context", () => {
  const validationErrors = [
    "Missing required field: name",
    "Invalid email format",
    "Password too short",
    "Username already exists",
    "Invalid JSON",
  ];

  validationErrors.forEach((message) => {
    const error = new ValidationError(message);
    assert.equal(error.statusCode, 400, `Status should be 400 for: ${message}`);
    assert.equal(error.message, message);
  });
});

test("ValidationError - can be thrown and caught", () => {
  assert.throws(
    () => {
      throw new ValidationError("Required field missing");
    },
    (err) => {
      return (
        err instanceof ValidationError &&
        err.statusCode === 400 &&
        err.message === "Required field missing"
      );
    }
  );
});

test("ValidationError - preserves error chain when thrown from function", () => {
  function validateEmail(email) {
    if (!email.includes("@")) {
      throw new ValidationError("Invalid email address");
    }
    return email;
  }

  assert.throws(
    () => validateEmail("notanemail"),
    (err) => {
      return (
        err instanceof ValidationError &&
        err.statusCode === 400 &&
        err.message === "Invalid email address"
      );
    }
  );

  assert.doesNotThrow(() => validateEmail("user@example.com"));
});

test("ValidationError - has stack trace", () => {
  const error = new ValidationError("Validation failed");

  assert.ok(error.stack, "error has stack trace");
  assert.ok(
    error.stack.includes("ValidationError"),
    "stack includes error name"
  );
});

test("ValidationError - can differentiate from generic HttpError", () => {
  const validationErr = new ValidationError("Invalid input");
  const httpErr = new HttpError(400, "Bad Request");

  assert.equal(validationErr.name, "ValidationError");
  assert.equal(httpErr.name, "HttpError");
  assert.notEqual(validationErr.name, httpErr.name);
});

test("ValidationError - works in catch blocks with type discrimination", () => {
  const errors = [
    new ValidationError("Field too long"),
    new HttpError(500, "Server error"),
  ];

  let validationCount = 0;
  let httpCount = 0;

  errors.forEach((error) => {
    if (error instanceof ValidationError) {
      validationCount++;
    } else if (error instanceof HttpError) {
      httpCount++;
    }
  });

  assert.equal(validationCount, 1, "Should identify 1 ValidationError");
  assert.equal(httpCount, 1, "Should identify 1 generic HttpError");
});

test("ValidationError - handles empty message", () => {
  const error = new ValidationError("");

  assert.equal(error.statusCode, 400);
  assert.equal(error.message, "");
  assert.ok(error instanceof ValidationError);
});

test("ValidationError - handles special characters in message", () => {
  const specialMessage =
    'Validation failed: Expected format "abc@xyz.com" got "invalid&<>"';
  const error = new ValidationError(specialMessage);

  assert.equal(error.message, specialMessage);
  assert.equal(error.statusCode, 400);
});

test("ValidationError - multiple instances are independent", () => {
  const error1 = new ValidationError("Email required");
  const error2 = new ValidationError("Password too weak");

  assert.equal(error1.statusCode, error2.statusCode);
  assert.notEqual(error1.message, error2.message);
  assert.equal(error1.name, error2.name);
});

test("ValidationError - can be caught as HttpError in catch-all handler", () => {
  function handleError(error) {
    if (error instanceof HttpError) {
      return { status: error.statusCode, message: error.message };
    }
    throw error;
  }

  const validationErr = new ValidationError("Invalid username");
  const result = handleError(validationErr);

  assert.deepEqual(result, {
    status: 400,
    message: "Invalid username",
  });
});

test("ValidationError - JSON serialization includes inherited properties", () => {
  const error = new ValidationError("User not found");
  const serialized = {
    statusCode: error.statusCode,
    message: error.message,
    name: error.name,
  };

  assert.deepEqual(serialized, {
    statusCode: 400,
    message: "User not found",
    name: "ValidationError",
  });
});

test("ValidationError - common validation error messages", () => {
  const commonErrors = [
    "Required field missing",
    "Invalid email format",
    "Password must be at least 8 characters",
    "Username already taken",
    "Invalid phone number",
    "Date must be in the future",
    "File size exceeds maximum",
  ];

  commonErrors.forEach((msg) => {
    const error = new ValidationError(msg);
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, msg);
    assert.equal(error.name, "ValidationError");
  });
});
