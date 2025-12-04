import assert from "node:assert/strict";
import test from "node:test";
import { buildJsonLdScript } from "./index.js";

const parseGraph = (html, options) => {
  const payload = JSON.parse(buildJsonLdScript(html, options));
  return { graph: payload["@graph"], payload };
};

const findNode = (graph, type) => graph.find((node) => node["@type"] === type);

test("builds organization, website, and page entries with decoded metadata", () => {
  const html = `
    <html lang="en">
      <head>
        <title>Product &amp; Stuff | Demo</title>
        <meta name="description" content="Short description">
        <meta property="og:title" content="OG Product">
        <meta property="og:description" content="Longer product description for search.">
        <meta property="og:site_name" content="Demo &amp; Co">
        <meta property="og:type" content="product">
        <link rel="canonical" href="https://example.com/products/1">
      </head>
      <body></body>
    </html>
  `;

  const { graph } = parseGraph(html);

  const organization = findNode(graph, "Organization");
  assert.ok(organization, "organization node");
  assert.equal(organization["@id"], "https://example.com#organization");
  assert.equal(organization.name, "Demo & Co");
  assert.equal(organization.url, "https://example.com");
  assert.equal(
    organization.description,
    "Longer product description for search."
  );

  const website = findNode(graph, "WebSite");
  assert.ok(website, "website node");
  assert.equal(website["@id"], "https://example.com#website");
  assert.equal(website.url, "https://example.com");
  assert.equal(website.name, "Demo & Co");
  assert.deepEqual(website.publisher, {
    "@id": "https://example.com#organization",
  });
  assert.equal(website.inLanguage, "en");

  const page = findNode(graph, "ItemPage");
  assert.ok(page, "page node");
  assert.equal(page["@id"], "https://example.com/products/1#webpage");
  assert.equal(page.url, "https://example.com/products/1");
  assert.equal(page.name, "Product & Stuff | Demo");
  assert.equal(page.description, "Longer product description for search.");
  assert.equal(page.inLanguage, "en");
});

test("derives page type from path heuristics and normalizes relative canonical with base", () => {
  const html = `
    <html>
      <head>
        <base href="https://example.com/shop/">
        <link rel="canonical" href="/collections/sale/">
        <meta property="og:site_name" content="Shop Name">
      </head>
      <body></body>
    </html>
  `;

  const { graph } = parseGraph(html);

  const website = findNode(graph, "WebSite");
  assert.equal(website.url, "https://example.com");

  const page = findNode(graph, "CollectionPage");
  assert.equal(page.url, "https://example.com/collections/sale");
  assert.equal(page["@id"], "https://example.com/collections/sale#webpage");
});

test("applies valid pageTypeOverride and ignores invalid overrides", () => {
  const html = `
    <html>
      <head>
        <link rel="canonical" href="https://example.com/contact">
        <title>Contact Us</title>
      </head>
    </html>
  `;

  const overrideResult = parseGraph(html, { pageTypeOverride: "FAQPage" });
  const overridePage = findNode(overrideResult.graph, "FAQPage");
  assert.ok(overridePage, "override should force FAQPage");

  const invalidOverrideResult = parseGraph(html, {
    pageTypeOverride: "NotAType",
  });
  const contactPage = findNode(invalidOverrideResult.graph, "ContactPage");
  assert.ok(
    contactPage,
    "heuristics should choose ContactPage when override invalid"
  );
});

test("falls back to defaults when metadata missing", () => {
  const html = `
    <html>
      <body>
        <p>Untitled</p>
      </body>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "default page node");
  assert.equal(page.inLanguage, "en", "language defaults to en");
  assert.equal(page["@id"], "#webpage");
  assert.equal(page.url, undefined);
});

test("handles invalid URLs in canonical and base href gracefully", () => {
  const html = `
    <html>
      <head>
        <base href="not a valid url!!!">
        <link rel="canonical" href="also invalid">
        <title>Test</title>
      </head>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "page created despite invalid URLs");
  assert.equal(page.url, undefined, "invalid canonical URL ignored");
  assert.equal(page.name, "Test", "title still used");
});

test("handles extremely long metadata values", () => {
  const longDesc = "A".repeat(10000);
  const html = `
    <html>
      <head>
        <title>Page Title</title>
        <meta name="description" content="${longDesc}">
        <link rel="canonical" href="https://example.com/test">
      </head>
    </html>
  `;

  const { graph, payload } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "page created with long description");
  assert.equal(page.description.length, 10000, "long description preserved");
  assert.ok(
    JSON.stringify(payload).length > 10000,
    "JSON output is large but valid"
  );
});

test("handles numeric HTML entities in metadata", () => {
  const html = `
    <html>
      <head>
        <title>Test &#169; 2024 &#8212; Company</title>
        <meta name="description" content="Price: &#36;99.99 &#x2713; Valid">
        <link rel="canonical" href="https://example.com">
      </head>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page.name.includes("©"), "numeric entity &#169; decoded");
  assert.ok(page.name.includes("—"), "numeric entity &#8212; decoded");
  assert.ok(page.description.includes("$"), "numeric entity &#36; decoded");
  assert.ok(page.description.includes("✓"), "hex entity &#x2713; decoded");
});

test("handles missing language attribute and invalid language codes", () => {
  const html1 = `
    <html>
      <head>
        <title>No Lang</title>
        <link rel="canonical" href="https://example.com">
      </head>
    </html>
  `;

  const { graph: graph1 } = parseGraph(html1);
  const page1 = findNode(graph1, "WebPage");
  assert.equal(page1.inLanguage, "en", "defaults to en when lang missing");

  const html2 = `
    <html lang="">
      <head>
        <title>Empty Lang</title>
        <link rel="canonical" href="https://example.com">
      </head>
    </html>
  `;

  const { graph: graph2 } = parseGraph(html2);
  const page2 = findNode(graph2, "WebPage");
  assert.equal(page2.inLanguage, "en", "defaults to en when lang empty");

  const html3 = `
    <html lang="en-US">
      <head>
        <title>Valid Lang</title>
        <link rel="canonical" href="https://example.com">
      </head>
    </html>
  `;

  const { graph: graph3 } = parseGraph(html3);
  const page3 = findNode(graph3, "WebPage");
  assert.equal(page3.inLanguage, "en-us", "language tag lowercased");
});

test("handles special characters in URL paths for page type detection", () => {
  const html = `
    <html>
      <head>
        <link rel="canonical" href="https://example.com/faq-help/articles">
        <title>FAQ</title>
      </head>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "FAQPage");
  assert.ok(page, "FAQPage detected despite hyphens in path");
});

test("handles malformed HTML without crashing", () => {
  const html = `
    <html>
      <head>
        <title>Unclosed title
        <meta property="og:title" content="test">
      </head>
      <body>
        <div>Unclosed div
        <p>Unclosed paragraph
        <link rel="canonical" href="https://example.com/test">
      </body>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "page created despite malformed HTML");
  assert.ok(page.name, "title extracted despite unclosed tags");
});

test("handles protocol-relative URLs in canonical", () => {
  const html = `
    <html>
      <head>
        <base href="https://example.com/">
        <link rel="canonical" href="//example.com/page">
        <title>Test</title>
      </head>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.equal(
    page.url,
    "https://example.com/page",
    "protocol-relative URL normalized to https"
  );
});

test("prioritizes og: metadata over standard metadata when both present", () => {
  const html = `
    <html>
      <head>
        <title>Standard Title</title>
        <meta name="description" content="Standard description">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG description that is much much longer and should be picked">
        <link rel="canonical" href="https://example.com">
      </head>
    </html>
  `;

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  // pickLongest picks the longer description
  assert.ok(
    page.description.includes("much much longer"),
    "longer OG description chosen"
  );
});

test("gracefully handles empty HTML string", () => {
  const html = "";

  const { graph } = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "page created from empty HTML");
  assert.equal(page.name, undefined, "no name from empty HTML");
  assert.equal(page.inLanguage, "en", "language defaults to en");
});
