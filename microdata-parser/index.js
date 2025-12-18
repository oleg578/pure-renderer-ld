import { JSDOM } from "jsdom";

export function parseMicrodata(html, options = {}) {
  const {
    baseUrl = null,
    compact = true,
    alwaysGraph = false,
    onLimit = "throw",
    limits = {},
    urlPolicy = {},
  } = options;

  function createEmptyResult() {
    return Object.create(null);
  }

  const defaultLimits = {
    maxHtmlLength: 10_000_000,
    maxItems: 10_000,
    maxItemRefIds: 1_000,
    maxPropertyElementsPerItem: 50_000,
    maxTotalPropertyElements: 200_000,
  };

  const effectiveUrlPolicy = {
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowRelative: true,
    allowProtocolRelative: false,
    allowUnsafeSchemes: false,
    ...urlPolicy,
  };

  const effectiveLimits =
    limits === false || limits === null
      ? {
          maxHtmlLength: Infinity,
          maxItems: Infinity,
          maxItemRefIds: Infinity,
          maxPropertyElementsPerItem: Infinity,
          maxTotalPropertyElements: Infinity,
        }
      : { ...defaultLimits, ...limits };

  function limitError(kind, max, actual) {
    const error = new RangeError(
      `microdata-parser limit exceeded (${kind}): max=${max}, actual=${actual}`
    );
    error.code = "MICRODATA_LIMIT_EXCEEDED";
    error.kind = kind;
    error.max = max;
    error.actual = actual;
    return error;
  }

  function handleLimit(kind, max, actual) {
    if (onLimit === "truncate") return false;
    throw limitError(kind, max, actual);
  }

  if (typeof html === "string" && html.length > effectiveLimits.maxHtmlLength) {
    handleLimit("maxHtmlLength", effectiveLimits.maxHtmlLength, html.length);
    return createEmptyResult();
  }

  let parsedBaseUrl = null;
  if (baseUrl) {
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      parsedBaseUrl = null;
    }
  }

  const dom = new JSDOM(html);
  const { document } = dom.window;

  function collectItems() {
    const root = document.documentElement || document;
    const walker = document.createTreeWalker(
      root,
      dom.window.NodeFilter.SHOW_ELEMENT
    );
    const result = [];
    if (root && root.nodeType === 1 && root.hasAttribute("itemscope")) {
      if (result.length >= effectiveLimits.maxItems) {
        const wouldBe = result.length + 1;
        if (!handleLimit("maxItems", effectiveLimits.maxItems, wouldBe)) return result;
      }
      result.push(root);
    }
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.hasAttribute || !node.hasAttribute("itemscope")) continue;
      if (result.length >= effectiveLimits.maxItems) {
        const wouldBe = result.length + 1;
        if (!handleLimit("maxItems", effectiveLimits.maxItems, wouldBe)) break;
      }
      result.push(node);
    }
    return result;
  }

  const items = collectItems();
  const elementToId = new Map();
  const elementToNode = new Map();
  const nodeById = new Map();
  let blankCounter = 0;

  const schemaOrgHttp = "http://schema.org/";
  const schemaOrgHttps = "https://schema.org/";
  const unsafePropertyKeys = new Set(["__proto__", "constructor", "prototype"]);
  let totalItempropSeen = 0;

  function createSafeNode() {
    return Object.create(null);
  }

  function tokenize(value) {
    if (!value) return [];
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    const seen = new Set();
    const result = [];
    for (const token of tokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      result.push(token);
    }
    return result;
  }

  function isAbsoluteUrl(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  function resolveUrl(value) {
    if (!value) return null;
    if (!parsedBaseUrl) return value;
    try {
      return new URL(value, parsedBaseUrl).toString();
    } catch {
      return value;
    }
  }

  function sanitizeAbsoluteUrl(value) {
    try {
      const url = new URL(value);
      const scheme = url.protocol.replace(/:$/, "").toLowerCase();
      if (!effectiveUrlPolicy.allowedSchemes.includes(scheme)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function sanitizeUrl(value) {
    if (!value) return null;
    if (effectiveUrlPolicy.allowUnsafeSchemes) return value;

    const raw = String(value).trim();
    if (!raw) return null;

    if (raw.startsWith("//")) {
      return effectiveUrlPolicy.allowProtocolRelative ? raw : null;
    }

    if (isAbsoluteUrl(raw)) {
      return sanitizeAbsoluteUrl(raw);
    }

    return effectiveUrlPolicy.allowRelative ? raw : null;
  }

  function normalizeSchemaOrg(url) {
    if (url.startsWith(schemaOrgHttp)) {
      return schemaOrgHttps + url.slice(schemaOrgHttp.length);
    }
    return url;
  }

  function getTypeBase(typeUrl) {
    if (!typeUrl) return null;
    if (typeUrl.startsWith(schemaOrgHttp) || typeUrl.startsWith(schemaOrgHttps)) {
      return schemaOrgHttps;
    }
    const hashIndex = typeUrl.lastIndexOf("#");
    const slashIndex = typeUrl.lastIndexOf("/");
    const cutIndex = Math.max(hashIndex, slashIndex);
    if (cutIndex === -1) return null;
    return typeUrl.slice(0, cutIndex + 1);
  }

  function getItemTypes(el) {
    const raw = tokenize(el.getAttribute("itemtype"));
    return raw.map((typeUrl) => normalizeSchemaOrg(typeUrl));
  }

  function getItemVocabBase(el) {
    const types = getItemTypes(el);
    if (types.length === 0) return null;
    return getTypeBase(types[0]);
  }

  function computeCommonVocabBase() {
    const bases = new Set();
    for (const el of items) {
      const types = getItemTypes(el);
      for (const typeUrl of types) {
        const base = getTypeBase(typeUrl);
        if (!base) return null;
        bases.add(base);
      }
    }
    if (bases.size === 1) return Array.from(bases)[0];
    return null;
  }

  const contextBase = compact ? computeCommonVocabBase() : null;

  function compactIri(iri) {
    if (!contextBase) return iri;
    if (contextBase === schemaOrgHttps) {
      const normalized = normalizeSchemaOrg(iri);
      if (normalized.startsWith(schemaOrgHttps)) {
        return normalized.slice(schemaOrgHttps.length);
      }
      return iri;
    }
    if (iri.startsWith(contextBase)) {
      return iri.slice(contextBase.length);
    }
    return iri;
  }

  function normalizeType(typeUrl) {
    const normalized = normalizeSchemaOrg(typeUrl);
    return contextBase ? compactIri(normalized) : normalized;
  }

  function normalizePropertyName(token, itemEl) {
    if (isAbsoluteUrl(token)) {
      return contextBase ? compactIri(normalizeSchemaOrg(token)) : token;
    }
    if (contextBase) return token;
    const base = getItemVocabBase(itemEl);
    if (base) return base + token;
    return token;
  }

  function getItemId(el) {
    if (elementToId.has(el)) return elementToId.get(el);
    const itemid = el.getAttribute("itemid");
    if (itemid) {
      const resolved = resolveUrl(itemid);
      elementToId.set(el, resolved);
      return resolved;
    }
    const blankId = `_:b${++blankCounter}`;
    elementToId.set(el, blankId);
    return blankId;
  }

  function getPropertyNames(el) {
    return tokenize(el.getAttribute("itemprop"));
  }

  function isInScope(el, itemEl) {
    let current = el.parentElement;
    while (current) {
      if (current.hasAttribute("itemscope")) {
        return current === itemEl;
      }
      current = current.parentElement;
    }
    return true;
  }

  function getItemRefElements(itemEl) {
    let refs = tokenize(itemEl.getAttribute("itemref"));
    if (refs.length > effectiveLimits.maxItemRefIds) {
      if (!handleLimit("maxItemRefIds", effectiveLimits.maxItemRefIds, refs.length)) {
        refs = refs.slice(0, effectiveLimits.maxItemRefIds);
      }
    }
    const result = [];
    for (const id of refs) {
      const refEl = document.getElementById(id);
      if (refEl) result.push(refEl);
    }
    return result;
  }

  function collectPropertyElements(itemEl) {
    const roots = [itemEl, ...getItemRefElements(itemEl)];
    const candidates = new Set();
    let itempropSeenForItem = 0;
    let stop = false;

    for (const root of roots) {
      if (!(root && root.nodeType === 1)) continue;
      if (root !== itemEl && root.hasAttribute("itemprop")) {
        const nextPerItem = itempropSeenForItem + 1;
        if (nextPerItem > effectiveLimits.maxPropertyElementsPerItem) {
          stop = !handleLimit(
            "maxPropertyElementsPerItem",
            effectiveLimits.maxPropertyElementsPerItem,
            nextPerItem
          );
          if (stop) break;
        }
        const nextTotal = totalItempropSeen + 1;
        if (nextTotal > effectiveLimits.maxTotalPropertyElements) {
          stop = !handleLimit(
            "maxTotalPropertyElements",
            effectiveLimits.maxTotalPropertyElements,
            nextTotal
          );
          if (stop) break;
        }

        itempropSeenForItem += 1;
        totalItempropSeen += 1;
        if (isInScope(root, itemEl)) candidates.add(root);
      }

      const walker = document.createTreeWalker(
        root,
        dom.window.NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            if (node !== root && node.hasAttribute && node.hasAttribute("itemprop")) {
              return dom.window.NodeFilter.FILTER_ACCEPT;
            }
            return dom.window.NodeFilter.FILTER_SKIP;
          },
        }
      );

      for (let el = walker.nextNode(); el; el = walker.nextNode()) {
        const nextPerItem = itempropSeenForItem + 1;
        if (nextPerItem > effectiveLimits.maxPropertyElementsPerItem) {
          stop = !handleLimit(
            "maxPropertyElementsPerItem",
            effectiveLimits.maxPropertyElementsPerItem,
            nextPerItem
          );
          break;
        }
        const nextTotal = totalItempropSeen + 1;
        if (nextTotal > effectiveLimits.maxTotalPropertyElements) {
          stop = !handleLimit(
            "maxTotalPropertyElements",
            effectiveLimits.maxTotalPropertyElements,
            nextTotal
          );
          break;
        }

        itempropSeenForItem += 1;
        totalItempropSeen += 1;

        if (el === itemEl) continue;
        if (!isInScope(el, itemEl)) continue;
        candidates.add(el);
      }
      if (stop) break;
    }
    const ordered = Array.from(candidates);
    ordered.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & dom.window.Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return ordered;
  }

  function valueKey(value) {
    if (value && typeof value === "object") {
      if (value["@id"]) return `@id:${value["@id"]}`;
      return `obj:${JSON.stringify(value)}`;
    }
    return `prim:${String(value)}`;
  }

  function dedupeValues(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const key = valueKey(value);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }

  function addProperty(node, key, value) {
    if (value === null || value === undefined) return;
    if (unsafePropertyKeys.has(key)) return;
    const existing = node[key];
    if (existing === undefined) {
      node[key] = value;
      return;
    }
    const values = Array.isArray(existing) ? existing.slice() : [existing];
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
    const deduped = dedupeValues(values);
    node[key] = deduped.length === 1 ? deduped[0] : deduped;
  }

  function buildItem(el) {
    const id = getItemId(el);
    let node = nodeById.get(id);
    if (!node) {
      node = createSafeNode();
      node["@id"] = id;
      nodeById.set(id, node);
    }
    elementToNode.set(el, node);

    const types = getItemTypes(el).map(normalizeType);
    if (types.length) {
      const existing = node["@type"];
      const merged = existing
        ? dedupeValues([].concat(existing, types))
        : types;
      node["@type"] = merged.length === 1 ? merged[0] : merged;
    }

    const propElements = collectPropertyElements(el);
    for (const propEl of propElements) {
      const names = getPropertyNames(propEl);
      if (names.length === 0) continue;
      const value = getPropertyValue(propEl);
      if (value === null || value === undefined) continue;
      for (const name of names) {
        const key = normalizePropertyName(name, el);
        addProperty(node, key, value);
      }
    }

    return node;
  }

  function textValue(el) {
    const text = el.textContent;
    if (!text) return null;
    const trimmed = text.trim();
    return trimmed.length ? trimmed : null;
  }

  function getPropertyValue(propEl) {
    if (propEl.hasAttribute("itemscope")) {
      const nested = buildItem(propEl);
      return nested["@id"] ? { "@id": nested["@id"] } : null;
    }
    const tag = propEl.tagName.toLowerCase();
    switch (tag) {
      case "meta":
        return propEl.getAttribute("content");
      case "audio":
      case "embed":
      case "iframe":
      case "img":
      case "source":
      case "track":
      case "video":
        return sanitizeUrl(resolveUrl(propEl.getAttribute("src")));
      case "a":
      case "area":
      case "link":
        return sanitizeUrl(resolveUrl(propEl.getAttribute("href")));
      case "object":
        return sanitizeUrl(resolveUrl(propEl.getAttribute("data")));
      case "data":
      case "meter":
        return propEl.getAttribute("value");
      case "time":
        return propEl.getAttribute("datetime") || textValue(propEl);
      case "input":
        return propEl.getAttribute("value");
      default:
        return textValue(propEl);
    }
  }

  for (const itemEl of items) {
    buildItem(itemEl);
  }

  const graph = Array.from(nodeById.values());
  if (graph.length === 0) return createEmptyResult();

  const result =
    graph.length === 1 && !alwaysGraph ? graph[0] : { "@graph": graph };

  if (contextBase) {
    const contextValue =
      contextBase === schemaOrgHttps ? "https://schema.org" : contextBase;
    result["@context"] = contextValue;
  }

  return result;
}
