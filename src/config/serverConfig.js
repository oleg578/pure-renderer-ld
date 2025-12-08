import {config as loadEnv} from "dotenv";

loadEnv();

const toNumber = (value, fallback, label) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `[serverConfig] ${label} must be a positive number. Received "${value}".`
    );
  }

  return parsed;
};

export const serverConfig = {
  host: process.env.SERVER_HOST?.trim() || "127.0.0.1",
  port: toNumber(process.env.SERVER_PORT, 51_000, "SERVER_PORT"),
  timeoutMs: toNumber(
    process.env.SERVER_TIMEOUT_MS ?? process.env.RENDER_TIMEOUT_MS,
    60_000,
    "SERVER_TIMEOUT_MS"
  ),
  fetchHtmlTimeoutMs: toNumber(
    process.env.FETCH_HTML_TIMEOUT,
    1000,
    "FETCH_HTML_TIMEOUT"
  ),
  stablePageTimeoutMs: toNumber(
    process.env.STABLE_PAGE_TIMEOUT ?? process.env.STABLE_PAGE_TIMeOUT,
    500,
    "STABLE_PAGE_TIMEOUT"
  ),
  tmpDir: process.env.TMP_DIR?.trim() || "./tmp",
};
