import { JSDOM } from "jsdom";
import { logger } from "../services/logger.js";

const MULTISPACE_REGEX = /\s{2,}/g;
const NBSP_REGEX = /(?:\u00a0|&nbsp;)/g;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const STRIP_SELECTOR =
  'iframe, script:not([type="application/ld+json"]), path, form, link:not([rel="stylesheet"]), noscript, footer, nav, svg';
const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "content",
  "name",
  "id",
  "href",
  "src",
  "alt",
  "itemscope",
  "itemtype",
  "itemprop",
  "itemid",
  "itemref",
  "value",
]);
const CLASS_KEYWORDS = [
  "article",
  "collection",
  "card",
  "desc",
  "description",
  "item",
  "price",
  "product",
  "qty",
  "quantity",
  "variant",
];
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "param",
  "source",
  "track",
  "wbr",
]);
const VOID_ELEMENTS_SELECTOR =
  VOID_ELEMENTS.size > 0 ? Array.from(VOID_ELEMENTS).join(",") : null;
const STRIP_CSS = String(process.env.STRIP_CSS ?? "").toLowerCase() === "true";

class HtmlCleaner {
  clean(documentHtml, parsedURL) {
    if (typeof documentHtml !== "string") {
      return "";
    }
    const trimmed = documentHtml.trim();
    if (trimmed === "") {
      return "";
    }
    // JSDOM spends most of the time parsing large inline stylesheets. When we
    // know we'll strip CSS anyway (STRIP_CSS=true), remove them before
    // constructing the DOM to keep processing fast and avoid timeouts.
    const sanitized =
      STRIP_CSS
        ? trimmed
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
        : trimmed;
    const dom = new JSDOM(sanitized);
    const { document } = dom.window;

    if (document) {
      logger.info("Remove comments");
      this.removeComments(document);
      if (document.body) {
        if (STRIP_CSS) {
          logger.info("Strip CSS tags (STRIP_CSS=true)");
          this.stripCssTags(document);
        }
        logger.info("Strip disallowed tags");
        this.stripDisallowedTags(document);
        logger.info("Remove disallowed attributes from body");
        this.removeDisallowedAttributesFromBody(document);
        logger.info("Remove empty elements");
        this.removeEmptyElements(document.body, false);
        logger.info("Collapse div soup");
        this.collapseDivSoup(document.body);
      }
      logger.info("Ensure base tag");
      this.ensureBaseTag(document, parsedURL);
      logger.info("Ensure canonical link");
      this.ensureCanonicalLink(document, parsedURL);
    }
    const serialized = dom.serialize();
    // Normalize whitespace: convert non-breaking spaces to regular spaces and collapse
    // multiple consecutive spaces into single spaces. This is safe because:
    // 1. <pre> tags are not in STRIP_SELECTOR but are not important for product data
    // 2. Semantic markup (itemscope, itemprop) is preserved for structured data
    // 3. Content inside meaningful text nodes is preserved
    return serialized
      .replace(NBSP_REGEX, " ")
      .replace(MULTISPACE_REGEX, " ")
      .trim();
  }

  stripDisallowedTags(document) {
    document
      .querySelectorAll(STRIP_SELECTOR)
      .forEach((element) => element.remove());
  }

  stripCssTags(document) {
    document
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((element) => element.remove());
  }

  removeDisallowedAttributesFromBody(document) {
    if (!document.body) {
      return;
    }

    document.body.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        if (!ALLOWED_ATTRIBUTES.has(attribute.name)) {
          element.removeAttribute(attribute.name);
        }
      });

      const classValue = element.getAttribute("class");
      if (classValue) {
        const filteredValues = Array.from(
          new Set(
            classValue
              .split(/\s+/)
              .filter(Boolean)
              .filter((value) => {
                const lower = value.toLowerCase();
                return CLASS_KEYWORDS.some((keyword) =>
                  lower.includes(keyword)
                );
              })
          )
        );

        if (filteredValues.length > 0) {
          element.setAttribute("class", filteredValues.join(" "));
        } else {
          element.removeAttribute("class");
        }
      }
    });
  }

  removeEmptyElements(element, allowRemoval = true) {
    if (element.tagName?.toLowerCase() === "meta") {
      return;
    }

    if (this.containsVoidElements(element)) {
      return;
    }
    Array.from(element.children).forEach((child) =>
      this.removeEmptyElements(child, true)
    );

    const hasContent = Array.from(element.childNodes).some((node) => {
      if (node.nodeType === ELEMENT_NODE) {
        return true;
      }

      if (node.nodeType === TEXT_NODE) {
        return Boolean(node.textContent?.trim());
      }

      return false;
    });

    if (!hasContent && allowRemoval && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  removeComments(node) {
    if (!node) {
      return;
    }

    // Safe from circular references because we iterate through DOM tree structure
    // which is guaranteed to be acyclic by the DOM specification
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (child.nodeType === COMMENT_NODE && child.parentNode) {
        child.parentNode.removeChild(child);
      } else {
        this.removeComments(child);
      }
      child = next;
    }
  }

  hasMeaningfulText(element) {
    return Array.from(element.childNodes).some(
      (node) => node.nodeType === TEXT_NODE && node.textContent?.trim()
    );
  }

  containsVoidElements(element) {
    if (VOID_ELEMENTS.has(element.tagName.toLowerCase())) {
      return true;
    }

    if (VOID_ELEMENTS_SELECTOR === null) {
      return false;
    }

    return Boolean(element.querySelector(VOID_ELEMENTS_SELECTOR));
  }

  collapseDivSoup(element) {
    // Recursively process children first (bottom-up approach)
    // Safe from circular references because DOM tree is acyclic
    Array.from(element.children).forEach((child) =>
      this.collapseDivSoup(child)
    );

    if (element.tagName !== "DIV") {
      return;
    }

    while (
      element.childElementCount === 1 &&
      !this.hasMeaningfulText(element) &&
      element.firstElementChild?.tagName === "DIV" &&
      element.firstElementChild.attributes.length === 0 &&
      !this.hasMeaningfulText(element.firstElementChild)
    ) {
      const child = element.firstElementChild;
      if (!child) {
        break;
      }

      while (child.firstChild) {
        element.insertBefore(child.firstChild, child);
      }

      element.removeChild(child);
    }
  }

  ensureBaseTag(document, parsedURL) {
    if (!parsedURL) {
      return;
    }

    if (document.querySelector("base")) {
      return;
    }

    const base = document.createElement("base");
    base.href = parsedURL.origin;

    if (document.head) {
      document.head.prepend(base);
    } else {
      document.appendChild(base);
    }
  }

  ensureCanonicalLink(document, parsedURL) {
    if (!parsedURL) {
      return;
    }

    const canonicalHref = `${parsedURL.origin}${parsedURL.pathname}`;
    let head = document.head;

    if (!head) {
      head = document.createElement("head");
      const html = document.documentElement;
      if (!html) {
        return; // Malformed document, abort
      }
      // Insert head as first child of html element
      if (html.firstChild) {
        html.insertBefore(head, html.firstChild);
      } else {
        html.appendChild(head);
      }
    }

    const existingCanonical = head.querySelector('link[rel="canonical"]');
    const canonicalLink = existingCanonical ?? document.createElement("link");

    canonicalLink.setAttribute("rel", "canonical");
    canonicalLink.setAttribute("href", canonicalHref);

    if (!existingCanonical) {
      head.appendChild(canonicalLink);
    }
  }
}

const htmlCleaner = new HtmlCleaner();

/**
 * Produces a lightweight HTML snapshot backed by a DOM generated via jsdom,
 * normalizing redundant whitespace so downstream consumers can parse it easily.
 */
export function cleanHTML(documentHtml, parsedURL) {
  return htmlCleaner.clean(documentHtml, parsedURL);
}
