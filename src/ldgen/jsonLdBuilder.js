import { URL } from "node:url";
import { JSDOM } from "jsdom";

const PAGE_TYPES = [
  "WebPage",
  "CollectionPage",
  "ItemPage",
  "SearchResultsPage",
  "ContactPage",
  "AboutPage",
  "FAQPage",
  "QAPage",
  "ProfilePage",
  "CheckoutPage",
];

export class JsonLdBuilder {
  constructor() {
    // Use a temporary DOM element to decode HTML entities
    // This handles all HTML entities including numeric ones (&#123;, &#x1F;)
    this.textDecoder =
      typeof document !== "undefined"
        ? document
        : new JSDOM("").window.document;
  }

  /**
   * Builds a JSON-LD Schema.org graph from HTML document
   * @param {string} html - HTML document string to extract metadata from
   * @param {Object} options - Configuration options
   * @param {string} [options.pageTypeOverride] - Force a specific Schema.org page type (must be valid PAGE_TYPES value)
   * @returns {string} JSON stringified Schema.org graph with Organization, WebSite, and Page entities
   */
  build(html, options = {}) {
    const metadata = this.extractMetadata(html);
    const canonicalUrl = this.normalizeUrl(
      metadata.canonicalUrl,
      metadata.baseHref
    );
    const metadataForType = { ...metadata, canonicalUrl };
    const pageType = this.derivePageType(
      metadataForType,
      options.pageTypeOverride
    );
    const language = metadata.language ?? "en";
    const pageName =
      metadata.title ??
      metadata.ogTitle ??
      metadata.ogSiteName ??
      metadata.siteName;
    const description = this.pickLongest([
      metadata.description,
      metadata.ogDescription,
      metadata.twitterDescription,
    ]);
    const siteName =
      metadata.ogSiteName ??
      metadata.siteName ??
      this.cleanName(metadata.title);
    const websiteUrl = canonicalUrl ? new URL(canonicalUrl).origin : undefined;

    const organizationId = websiteUrl
      ? `${websiteUrl}#organization`
      : undefined;
    const websiteId = websiteUrl ? `${websiteUrl}#website` : undefined;
    const pageId = canonicalUrl ? `${canonicalUrl}#webpage` : undefined;

    const graph = [];

    if (organizationId && siteName) {
      graph.push(
        this.removeEmpty({
          "@type": "Organization",
          "@id": organizationId,
          name: siteName,
          url: websiteUrl,
          description,
        })
      );
    }

    if (websiteId && websiteUrl) {
      graph.push(
        this.removeEmpty({
          "@type": "WebSite",
          "@id": websiteId,
          url: websiteUrl,
          name: siteName,
          publisher: organizationId ? { "@id": organizationId } : undefined,
          inLanguage: language,
          description,
        })
      );
    }

    graph.push(
      this.removeEmpty({
        "@type": pageType,
        "@id": pageId ?? "#webpage",
        url: canonicalUrl,
        name: pageName,
        description,
        inLanguage: language,
      })
    );

    const payload = {
      "@context": "https://schema.org",
      "@graph": graph,
    };

    return JSON.stringify(payload, null, 2);
  }

  derivePageType(metadata, override) {
    if (override) {
      if (PAGE_TYPES.includes(override)) {
        return override;
      }
      // Log warning when invalid override is provided
      console.warn(
        `Invalid pageTypeOverride "${override}". Must be one of: ${PAGE_TYPES.join(
          ", "
        )}. Using heuristics instead.`
      );
    }

    const ogType = metadata.ogType?.toLowerCase();
    if (ogType === "product") return "ItemPage";
    if (ogType === "profile") return "ProfilePage";

    const canonicalPath = (() => {
      if (!metadata.canonicalUrl) return "";
      try {
        return new URL(metadata.canonicalUrl).pathname.toLowerCase();
      } catch {
        return metadata.canonicalUrl.toLowerCase();
      }
    })();

    // Path matchers determine page type from URL patterns
    // Patterns are checked in order - first match wins
    const pathMatchers = [
      [/\/search/, "SearchResultsPage"],
      [/\bfaq\b/, "FAQPage"],
      [/\bcontact/, "ContactPage"],
      [/\babout\b/, "AboutPage"],
      [/checkout|cart/, "CheckoutPage"],
      [/(profile|account|user)/, "ProfilePage"],
      [/\/collections\//, "CollectionPage"],
      [/\/products?\//, "ItemPage"],
      [/\bqa\b/, "QAPage"],
    ];

    const matched = pathMatchers.find(([pattern]) =>
      pattern.test(canonicalPath)
    );
    return matched ? matched[1] : "WebPage";
  }

  extractMetadata(html) {
    const document = this.createDom(html);

    const title = this.readTextContent(document, "title");
    const description = this.readAttribute(
      document,
      'meta[name="description"]',
      "content"
    );
    const ogTitle = this.readAttribute(
      document,
      'meta[property="og:title"]',
      "content"
    );
    const ogDescription = this.readAttribute(
      document,
      'meta[property="og:description"]',
      "content"
    );
    const ogSiteName = this.readAttribute(
      document,
      'meta[property="og:site_name"]',
      "content"
    );
    const ogType = this.readAttribute(
      document,
      'meta[property="og:type"]',
      "content"
    );
    const siteName = this.readAttribute(
      document,
      'meta[name="application-name"]',
      "content"
    );
    const twitterDescription = this.readAttribute(
      document,
      'meta[name="twitter:description"]',
      "content"
    );
    const canonicalUrl = this.readAttribute(
      document,
      'link[rel="canonical"]',
      "href"
    );
    const baseHref = this.readAttribute(document, "base[href]", "href");
    const language = document.documentElement.getAttribute("lang")?.trim();

    return {
      canonicalUrl,
      baseHref,
      description,
      language: language ? language.toLowerCase() : undefined,
      ogDescription,
      twitterDescription,
      ogSiteName,
      ogTitle,
      ogType,
      siteName,
      title,
    };
  }

  normalizeUrl(candidate, baseHref) {
    if (!candidate) {
      return undefined;
    }

    const allowedProtocols = new Set(["http:", "https:"]);
    const toAbsoluteUrl = (value, base) => {
      const sanitized = value.trim();
      if (!sanitized || /[\s\x00-\x1f]/.test(sanitized)) {
        return undefined;
      }

      try {
        const withProtocol = base
          ? sanitized
          : sanitized.startsWith("//")
          ? `https:${sanitized}`
          : sanitized;

        const resolved = base
          ? new URL(sanitized, base)
          : new URL(withProtocol);
        return allowedProtocols.has(resolved.protocol) ? resolved : undefined;
      } catch {
        return undefined;
      }
    };

    // Only attempt to resolve candidate if baseHref is valid
    const baseUrl = baseHref ? toAbsoluteUrl(baseHref) : undefined;
    if (baseHref && !baseUrl) {
      // Invalid base href, treat candidate as absolute URL
      return this.normalizeUrl(candidate, undefined);
    }

    const resolved = toAbsoluteUrl(candidate, baseUrl ?? undefined);

    if (!resolved) {
      return undefined;
    }

    return resolved.toString().replace(/\/$/, "");
  }

  decodeHtmlEntities(value) {
    // Use DOM textContent to decode all HTML entities (including numeric ones)
    // This is more robust than manual mapping and handles all valid HTML entities
    const textarea = this.textDecoder.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.textContent || value;
  }

  createDom(html) {
    try {
      return new JSDOM(html).window.document;
    } catch (error) {
      console.warn(
        "Failed to parse HTML with JSDOM, returning empty document",
        error.message
      );
      return new JSDOM("").window.document;
    }
  }

  readAttribute(document, selector, attribute) {
    const value = document
      .querySelector(selector)
      ?.getAttribute(attribute)
      ?.trim();
    return value ? this.decodeHtmlEntities(value) : undefined;
  }

  readTextContent(document, selector) {
    const value = document.querySelector(selector)?.textContent?.trim();
    return value ? this.decodeHtmlEntities(value) : undefined;
  }

  cleanName(value) {
    return value?.split("|")[0]?.trim() || value?.trim();
  }

  removeEmpty(entry) {
    return Object.entries(entry).reduce((acc, [key, value]) => {
      if (value === undefined || value === null || value === "") {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
  }

  pickLongest(values) {
    return values.reduce((longest, value) => {
      if (value && (longest === undefined || value.length > longest.length)) {
        return value;
      }
      return longest;
    }, undefined);
  }
}

export const jsonLdBuilder = new JsonLdBuilder();

/**
 * Builds a JSON-LD Schema.org graph from HTML document
 * @param {string} html - HTML document string to extract metadata from
 * @param {Object} [options] - Configuration options
 * @param {string} [options.pageTypeOverride] - Force a specific Schema.org page type
 * @returns {string} JSON stringified Schema.org graph with metadata entities
 * @example
 * const html = '<html><title>My Page</title><meta name="description" content="..."></html>';
 * const jsonLd = buildJsonLdScript(html, { pageTypeOverride: 'ItemPage' });
 * const schema = JSON.parse(jsonLd);
 */
export const buildJsonLdScript = (html, options = {}) =>
  jsonLdBuilder.build(html, options);

export default buildJsonLdScript;
