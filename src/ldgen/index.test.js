import assert from "node:assert/strict";
import test from "node:test";
import {buildJsonLdScript} from "./index.js";

const parseGraph = (html, options) => {
  const payload = JSON.parse(buildJsonLdScript(html, options));
  return {graph: payload["@graph"], payload};
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

  const {graph} = parseGraph(html);

  const organization = findNode(graph, "Organization");
  assert.ok(organization, "organization node");
  assert.equal(organization["@id"], "https://example.com#organization");
  assert.equal(organization.name, "Demo & Co");
  assert.equal(organization.url, "https://example.com");
  assert.equal(organization.description, "Longer product description for search.");

  const website = findNode(graph, "WebSite");
  assert.ok(website, "website node");
  assert.equal(website["@id"], "https://example.com#website");
  assert.equal(website.url, "https://example.com");
  assert.equal(website.name, "Demo & Co");
  assert.deepEqual(website.publisher, {"@id": "https://example.com#organization"});
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

  const {graph} = parseGraph(html);

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

  const overrideResult = parseGraph(html, {pageTypeOverride: "FAQPage"});
  const overridePage = findNode(overrideResult.graph, "FAQPage");
  assert.ok(overridePage, "override should force FAQPage");

  const invalidOverrideResult = parseGraph(html, {pageTypeOverride: "NotAType"});
  const contactPage = findNode(invalidOverrideResult.graph, "ContactPage");
  assert.ok(contactPage, "heuristics should choose ContactPage when override invalid");
});

test("falls back to defaults when metadata missing", () => {
  const html = `
    <html>
      <body>
        <p>Untitled</p>
      </body>
    </html>
  `;

  const {graph} = parseGraph(html);
  const page = findNode(graph, "WebPage");
  assert.ok(page, "default page node");
  assert.equal(page.inLanguage, "en", "language defaults to en");
  assert.equal(page["@id"], "#webpage");
  assert.equal(page.url, undefined);
});
