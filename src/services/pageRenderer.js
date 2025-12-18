import { promises as fs } from "fs";
import { JSDOM } from "jsdom";
import path from "path";
import puppeteer from "puppeteer";
import { serverConfig } from "../config/serverConfig.js";
import { buildJsonLdScript } from "../ldgen/index.js";
import { parseMicrodata } from "../microdata-parser/index.js"; // Ensure microdata parser is loaded
import { cleanHTML } from "../reduce/index.js";
import { logger } from "./logger.js";

const isSnapshotEnabled = parseSnapshotFlag(process.env.SNAPSHOT);

export class PageRenderer {
  inflight = 0;
  lastChange = Date.now();

  constructor(options = {}) {
    this.launchOptions = options.launchOptions ?? {};
  }

  async render(url) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...this.launchOptions,
    });

    try {
      const page = await browser.newPage();
      const parsedUrl = this.parseUrl(url);

      const customUserAgent = process.env.USER_AGENT?.trim();
      if (customUserAgent) {
        logger.info(`Applying custom USER_AGENT`);
        await page.setUserAgent({ userAgent: customUserAgent });
      }

      await page.setRequestInterception(true);
      page.on("request", (request) => {
        logger.log(`Request ${request.url()}: ${request.resourceType()}`);
        const u = request.url();
        if (
          ["font", "stylesheet", "media", "xhr", "websocket", "ping"].includes(
            request.resourceType()
          )
        ) {
          request.abort();
          logger.log(
            `Request ${request.url()}: ${request.resourceType()} => aborted by type`
          );
        } else if (
          u.includes("analytics") ||
          u.includes("gtm") ||
          u.includes("doubleclick") ||
          u.includes("hotjar") ||
          u.includes("optimizely")
        ) {
          logger.log(
            `Request ${request.url()}: ${request.resourceType()} => aborted analytics`
          );
          request.abort();
        } else {
          logger.log(`Request ${request.url()}:`, request.resourceType());
          request.continue();
        }
      });

      logger.info(`Parse resource: ${url}`);

      await page.goto(url);

      // Wait for DOM to be stable
      await this.waitForDOMStable(
        page,
        serverConfig.stablePageTimeoutMs,
        serverConfig.timeoutMs
      );

      logger.info(`Trying to get content: ${url}`);
      const content = await this.getFullHTML(page).catch((error) => {
        throw new Error(`Failed to get content for ${url}: ${error.message}`);
      });

      if (isSnapshotEnabled) {
        await this.persistHtmlSnapshot(content, parsedUrl, "_raw");
      }

      logger.info(`Got content from: ${url}`);
      const cleanedContent = cleanHTML(content, parsedUrl);
      const htmlWithJsonLd = await this.injectJsonLd(cleanedContent);

      if (isSnapshotEnabled) {
        await this.persistHtmlSnapshot(htmlWithJsonLd, parsedUrl, "_cleaned");
      }

      return htmlWithJsonLd;
    } finally {
      await browser.close();
    }
  }

  async getFullHTML(page, timeoutMs = serverConfig.fetchHtmlTimeoutMs) {
    const client = await page.target().createCDPSession();
    const { root } = await this.sendWithTimeout(
      client,
      "DOM.getDocument",
      { depth: -1 },
      timeoutMs
    );
    const { outerHTML } = await this.sendWithTimeout(
      client,
      "DOM.getOuterHTML",
      { nodeId: root.nodeId },
      timeoutMs
    );
    if (!outerHTML || outerHTML.trim() === "") {
      throw new Error("Failed to retrieve page content: empty outerHTML");
    }
    return outerHTML;
  }

  async sendWithTimeout(client, method, params, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      const result = await Promise.race([
        client.send(method, params),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async waitForDOMStable(
    page,
    timeout = serverConfig.stablePageTimeoutMs,
    maxWait = serverConfig.timeoutMs
  ) {
    await page.evaluate(
      (timeout, maxWait) => {
        return new Promise((resolve, reject) => {
          let mutationTimeout;
          let maxTimeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("exceeded max wait time for DOM stability"));
          }, maxWait);

          const observer = new MutationObserver(() => {
            clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(() => {
              clearTimeout(maxTimeout);
              observer.disconnect();
              resolve();
            }, timeout);
          });

          const startObserving = () => {
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
            });
          };

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", startObserving);
          } else {
            startObserving();
          }
        });
      },
      timeout,
      maxWait
    );
  }

  parseUrl(rawUrl) {
    try {
      return new URL(rawUrl);
    } catch {
      return undefined;
    }
  }

  /**
   * Writes HTML snapshots to LOG_DIR (from .env) for debugging both raw and cleaned markup.
   */
  async persistHtmlSnapshot(html, parsedUrl, suffix) {
    if (!isSnapshotEnabled) {
      return;
    }
    logger.log("Check log path for HTML snapshotting");
    const envPath = process.env.LOG_DIR?.trim();
    const logDir = envPath && envPath !== "" ? envPath : "./log/snapshots";
    const targetDir = path.isAbsolute(logDir)
      ? logDir
      : path.join(process.cwd(), logDir);
    const baseName = this.buildSnapshotBaseName(parsedUrl);
    const filePath = path.join(targetDir, `${baseName}_${suffix}.html`);

    try {
      logger.log(`Writing HTML snapshot to ${filePath}`);
      const dirStats = await fs.stat(targetDir).catch(async (error) => {
        if (error?.code === "ENOENT") {
          return undefined;
        }
        throw error;
      });

      if (!dirStats) {
        await fs.mkdir(targetDir, { recursive: true });
      }
      await fs.writeFile(filePath, html, "utf-8");
    } catch (error) {
      // Logging failure should not break rendering flow.
      console.error(`Failed to write HTML snapshot to ${filePath}`, error);
    }
    logger.log(`Finished writing HTML snapshot to ${filePath}`);
  }

  buildTimestampSuffix(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
  }

  buildSnapshotBaseName(parsedUrl) {
    if (!parsedUrl) {
      return "page";
    }

    const pathPart = parsedUrl.pathname?.replace(/\//g, "-") ?? "";
    const rawBase = `${parsedUrl.hostname}${pathPart}` || "page";
    const sanitized = rawBase
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);

    return sanitized || "page";
  }

  async injectJsonLd(html) {
    try {
      if (typeof html !== "string" || html.trim() === "") {
        return html;
      }
      const microdata = await parseMicrodata(html);

      const dom = new JSDOM(html);
      const { document } = dom.window;

      if (!document) {
        return html;
      }

      const head = document.head ?? document.createElement("head");
      if (!document.head) {
        const root = document.documentElement;
        if (root.firstChild) {
          root.insertBefore(head, root.firstChild);
        } else {
          root.appendChild(head);
        }
      }

      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      let jsonLdContent = "";
      // if microdata is not empty
      if (Object.keys(microdata).length !== 0) {
        jsonLdContent = JSON.stringify(microdata, null, 2);
      } else {
        jsonLdContent = buildJsonLdScript(html);
      }
      script.textContent = jsonLdContent;
      head.appendChild(script);

      return dom.serialize();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to inject JSON-LD", error);
      return html;
    }
  }

  logInflight(reason) {
    const now = Date.now();
    console.log(
      `[${((now - this.start) / 1000).toFixed(2)}s] inflight=${
        this.inflight
      } (${reason})`
    );
    this.lastChange = now;
  }
}

function parseSnapshotFlag(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return false;
}

/**
 * Simple timeout helper to avoid relying on Puppeteer wait helpers across versions.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
