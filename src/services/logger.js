import { promises as fs } from "fs";
import path from "path";
import { formatWithOptions } from "util";
import { loggerConfig } from "../config/loggerConfig.js";

const LOG_LEVELS = ["log", "info", "warn", "error"];
const nativeConsole = {
  error: console.error.bind(console),
};

/**
 * Facade for console-like logging that writes log entries to the configured file.
 */
export class Logger {
  constructor(config) {
    this.logFilePath = config.logFilePath;
    this.enabledLevels = new Set(config.enabledLevels);
    this.ensureDirPromise = undefined;
  }

  /**
   * Writes a general log entry.
   */
  async log(...args) {
    await this.write("log", args);
  }

  /**
   * Writes an informational log entry.
   */
  async info(...args) {
    await this.write("info", args);
  }

  /**
   * Writes a warning log entry.
   */
  async warn(...args) {
    await this.write("warn", args);
  }

  /**
   * Writes an error log entry.
   */
  async error(...args) {
    await this.write("error", args);
  }

  async write(level, args) {
    if (!LOG_LEVELS.includes(level)) {
      return;
    }

    if (!this.enabledLevels.has(level)) {
      return;
    }

    try {
      await this.ensureLogDirectory();
      await fs.appendFile(this.logFilePath, this.formatEntry(level, args), "utf-8");
    } catch (error) {
      // eslint-disable-next-line no-console
      nativeConsole.error("Failed to write to log file:", error);
    }
  }

  async ensureLogDirectory() {
    if (!this.ensureDirPromise) {
      this.ensureDirPromise = fs
        .mkdir(path.dirname(this.logFilePath), { recursive: true })
        .then(() => undefined)
        .catch((error) => {
          // Reset to allow retry on subsequent attempts.
          this.ensureDirPromise = undefined;
          throw error;
        });
    }

    await this.ensureDirPromise;
  }

  formatEntry(level, args) {
    const timestamp = new Date().toISOString();
    const message = formatWithOptions({ depth: 5, breakLength: 120 }, ...args);
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  }
}

export const logger = new Logger(loggerConfig);
