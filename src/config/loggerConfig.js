import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv();

const DEFAULT_LOG_DIR = "./log";
const DEFAULT_LOG_FILE = "app.log";
const VALID_LEVELS = ["log", "info", "warn", "error"];

const resolveLogDir = (value) => {
  const trimmed = value?.trim();
  const directory = trimmed && trimmed !== "" ? trimmed : DEFAULT_LOG_DIR;
  return path.isAbsolute(directory)
    ? directory
    : path.join(process.cwd(), directory);
};

const resolveLogFileName = (value) => {
  const trimmed = value?.trim();
  const fileName = trimmed && trimmed !== "" ? trimmed : DEFAULT_LOG_FILE;
  const normalized = path.basename(fileName);
  return normalized || DEFAULT_LOG_FILE;
};

const parseEnabledLevels = (value) => {
  if (!value) {
    return new Set(VALID_LEVELS);
  }

  const [commentStripped = ""] = value.split("//");
  const parsedLevels = commentStripped
    .split(",")
    .map((level) => level.trim().toLowerCase())
    .filter((level) => VALID_LEVELS.includes(level));

  return parsedLevels.length > 0
    ? new Set(parsedLevels)
    : new Set(VALID_LEVELS);
};

const logDir = resolveLogDir(process.env.LOG_DIR);
const logFileName = resolveLogFileName(process.env.LOG_FILE);

export const loggerConfig = {
  logFilePath: path.join(logDir, logFileName),
  enabledLevels: parseEnabledLevels(process.env.LOG_LEVEL),
};
