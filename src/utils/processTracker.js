import {promises as fs} from "fs";
import {join, dirname} from "path";

/**
 * ProcessTracker manages a file-based flag to track render process status.
 * Ensures the flag is always reset to 0, even on errors or abnormal termination.
 */
export class ProcessTracker {
  constructor(tmpDir) {
    this.filePath = join(tmpDir, "process");
  }

  /**
   * Ensures the tmp directory exists
   */
  async ensureDirectory() {
    const dir = dirname(this.filePath);
    try {
      await fs.mkdir(dir, {recursive: true});
    } catch (error) {
      // Ignore error if directory already exists
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Writes the given value to the process file
   */
  async writeValue(value) {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, value.toString(), "utf-8");
  }

  /**
   * Sets the process flag to 1 (active)
   */
  async start() {
    await this.writeValue(1);
  }

  /**
   * Sets the process flag to 0 (inactive)
   */
  async finish() {
    await this.writeValue(0);
  }

  /**
   * Executes a function while tracking its execution.
   * Ensures the process flag is reset to 0 even if the function throws an error.
   */
  async track(fn) {
    await this.start();
    try {
      return await fn();
    } finally {
      await this.finish();
    }
  }

  /**
   * Initializes the process file to 0
   */
  async initialize() {
    await this.finish();
  }

  /**
   * Reads the current progress value from the file.
   * Returns 0 if the file doesn't exist or contains invalid data.
   */
  async getProgress() {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const value = parseInt(content.trim(), 10);
      return value === 0 || value === 1 ? value : 0;
    } catch (error) {
      // Return 0 if file doesn't exist or can't be read
      return 0;
    }
  }
}
