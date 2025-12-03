import { JSDOM } from "jsdom";
import { logger } from "../services/logger.js";

const MULTISPACE_REGEX = /\s{2,}/g;
const NBSP_REGEX = /(?:\u00a0|&nbsp;)/g;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const STRIP_SELECTOR = "script, style, path, form, link, noscript, header, footer, nav, svg";
const ALLOWED_ATTRIBUTES = new Set([
    "class",
    "data-gseo",
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
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);
const VOID_ELEMENTS_SELECTOR = Array.from(VOID_ELEMENTS).join(",");

class HtmlCleaner {
    clean(documentHtml, parsedURL) {
        if (typeof documentHtml !== "string") {
            return "";
        }
        const trimmed = documentHtml.trim();
        if (trimmed === "") {
            return "";
        }
        const dom = new JSDOM(trimmed);
        const { document } = dom.window;

        if (document) {
            logger.info("Remove comments");
            this.removeComments(document);
            if (document.body) {
                logger.info("Strip disallowed tags");
                this.stripDisallowedTags(document);
                logger.info("Remove disallowed attributes from body");
                this.removeDisallowedAttributesFromBody(document);
                logger.info("Remove empty elements");
                this.removeEmptyElements(document.body, false);
                logger.info("Collapse div soup");
                this.collapseDivSoup(document.body);
            }
            logger.info("Remove non-description meta tags");
            this.removeNonDescriptionMeta(document);
            logger.info("Ensure base tag");
            this.ensureBaseTag(document, parsedURL);
            logger.info("Ensure canonical link");
            this.ensureCanonicalLink(document, parsedURL);
        }
        const serialized = dom.serialize();
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

    removeNonDescriptionMeta(document) {
        document.querySelectorAll("meta").forEach((element) => {
            const nameValue = element.getAttribute("name");
            if (!nameValue || !nameValue.toLowerCase().includes("description")) {
                element.remove();
            }
        });
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

        if (!VOID_ELEMENTS_SELECTOR) {
            return false;
        }

        return Boolean(element.querySelector(VOID_ELEMENTS_SELECTOR));
    }

    collapseDivSoup(element) {
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
export async function cleanHTML(documentHtml, parsedURL) {
    return htmlCleaner.clean(documentHtml, parsedURL);
}
