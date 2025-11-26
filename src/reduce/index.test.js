import assert from "node:assert/strict";
import test from "node:test";
import {JSDOM} from "jsdom";
import {cleanHTML} from "./index.js";
import {logger} from "../services/logger.js";

const noopAsync = async () => undefined;
["log", "info", "warn", "error", "write"].forEach((method) => {
  logger[method] = noopAsync;
});

const parseCleanedDocument = async (html, parsedUrl) => {
  const cleaned = await cleanHTML(html, parsedUrl);
  return {cleaned, document: new JSDOM(cleaned).window.document};
};

test("removes comments and disallowed tags while keeping description meta", async () => {
  const {cleaned, document} = await parseCleanedDocument(
    `
      <!doctype html>
      <html>
        <head>
          <meta name="description" content="keep me">
          <meta name="keywords" content="drop me">
          <script>console.log('secret')</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <!-- noisy comment -->
          <div>content</div>
        </body>
      </html>
    `,
    new URL("https://example.com/products/1")
  );

  assert.equal(document.querySelectorAll("script, style").length, 0);
  assert.equal(document.querySelectorAll("meta").length, 1);
  assert.equal(document.querySelector("meta")?.getAttribute("name"), "description");
  assert.ok(!cleaned.includes("<!-- noisy comment -->"));
});

test("removes disallowed attributes and filters class names to product keywords", async () => {
  const {document} = await parseCleanedDocument(
    `
      <html>
        <body>
          <div id="product-1" class="Product-card foo bar" style="color:red" onclick="alert(1)" data-gseo="keep" data-other="drop">
            <span class="price-tag highlight qty-label">19.99</span>
          </div>
        </body>
      </html>
    `,
    new URL("https://example.com/products/1")
  );

  const container = document.querySelector("div#product-1");
  assert.ok(container, "expected product container");
  assert.equal(container.getAttribute("class"), "Product-card");
  assert.equal(container.getAttribute("data-gseo"), "keep");
  assert.ok(!container.hasAttribute("style"));
  assert.ok(!container.hasAttribute("onclick"));
  assert.ok(!container.hasAttribute("data-other"));

  const priceTag = document.querySelector("span");
  assert.ok(priceTag, "expected price tag");
  assert.equal(priceTag.getAttribute("class"), "price-tag qty-label");
});

test("collapses div soup and removes empty wrappers", async () => {
  const {document} = await parseCleanedDocument(
    `
      <html>
        <body>
          <div>
            <div></div>
            <div>
              <div>
                <p>Keep me</p>
              </div>
            </div>
          </div>
          <div>
            <span> </span>
          </div>
        </body>
      </html>
    `,
    new URL("https://example.com/products/1")
  );
  const bodyChildren = Array.from(document.body.children);
  assert.equal(bodyChildren.length, 1);

  const flattened = bodyChildren[0];
  assert.equal(flattened.tagName, "DIV");
  const paragraph = flattened.querySelector("p");
  assert.ok(paragraph, "expected paragraph content");
  assert.equal(paragraph.textContent, "Keep me");
});

test("adds base and canonical tags when provided a URL", async () => {
  const parsedUrl = new URL("https://example.com/products/1?ref=ad");
  const {document} = await parseCleanedDocument(
    `
      <html>
        <head></head>
        <body><p>Example</p></body>
      </html>
    `,
    parsedUrl
  );

  const baseTag = document.querySelector("base");
  assert.ok(baseTag, "expected base tag");
  assert.equal(baseTag?.getAttribute("href"), parsedUrl.origin);

  const canonical = document.querySelector('link[rel="canonical"]');
  assert.ok(canonical, "expected canonical link");
  assert.equal(
    canonical?.getAttribute("href"),
    `${parsedUrl.origin}${parsedUrl.pathname}`
  );
});

test("does not add base or canonical when URL is missing", async () => {
  const {document} = await parseCleanedDocument(
    `
      <html>
        <body><p>Example</p></body>
      </html>
    `
  );

  assert.ok(!document.querySelector("base"));
  assert.ok(!document.querySelector('link[rel="canonical"]'));
});

test("normalizes non-breaking spaces and repeated whitespace inside text", async () => {
  const {cleaned, document} = await parseCleanedDocument(
    `
      <html>
        <body>
          <p>a\u00a0\u00a0\u00a0b</p>
        </body>
      </html>
    `,
    new URL("https://example.com/products/1")
  );

  const textContent = document.querySelector("p")?.textContent;
  assert.equal(textContent, "a b");
  assert.ok(!cleaned.includes("\u00a0"));
  assert.ok(!/\s{2,}/.test(cleaned));
});
