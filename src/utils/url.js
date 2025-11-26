import {ValidationError} from "../errors/validationError.js";

/**
 * Normalizes a provided URL string, ensuring it is HTTP(S) and returning the full URL.
 * @param {string} candidate
 * @returns {string}
 * @throws {ValidationError} when the input is empty, invalid, or not HTTP(S).
 */
export function normalizeHttpUrl(candidate) {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new ValidationError("Field 'url' must be a non-empty string.");
  }

  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    throw new ValidationError("Field 'url' must be a valid URL.");
  }

  if (!isHttpProtocol(parsed.protocol)) {
    throw new ValidationError("URL must use HTTP or HTTPS protocol.");
  }

  return parsed.toString();
}

function isHttpProtocol(protocol) {
  return protocol === "http:" || protocol === "https:";
}
