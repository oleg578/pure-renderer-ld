# PureRenderer-LD

Lean, self-hosted HTML renderer that turns any HTTP(S) page into a cleaned SEO snapshot with injected JSON-LD. Built on Puppeteer and Express as a drop-in alternative to prerender.io / Rendertron.

## What It Does
- **GET /render?url=…** returns minimized HTML with JSON-LD; errors come back as `{ "error": "…" }`.
- Filters non-essential requests (fonts, stylesheets, media, xhr/ws/ping, common analytics/AB scripts) for repeatable renders.
- Waits for DOM stability via `MutationObserver`, then pulls markup directly with CDP `DOM.getOuterHTML` to avoid Puppeteer timing quirks.
- Cleans markup: strips scripts/styles/forms/nav/svg/etc., keeps only safe attributes, collapses empty div soup, normalizes whitespace, and enforces `<base>` + canonical link.
- Builds a JSON-LD graph (Organization, WebSite, derived WebPage type) from existing meta tags and canonical URLs.
- Tracks in-flight work in a file-backed flag (`tmp/process`) surfaced at **GET /progress**.
- Supports a custom **USER_AGENT** for pages that gate content; sanitizes snapshot filenames when snapshotting is wired in.

## Quick Start
- Prereq: Node.js **>= 18.18** (Puppeteer downloads Chromium on first install).
- Install: `npm install`
- Configure: `cp .env.example .env` then tweak values (see below).
- Run: `npm start` (or `npm run dev` for watch mode, `npm run check` for syntax, `npm test` for node's built-in tests if added).

## Environment
Defined in `.env` (defaults from `.env.example`):
- `SERVER_HOST` / `SERVER_PORT` — bind address and port (default `127.0.0.1:51000`).
- `SERVER_TIMEOUT_MS` — overall request timeout; also used as max DOM-stability wait (default `60000`).
- `FETCH_HTML_TIMEOUT` — CDP outerHTML fetch timeout in ms (default `1000`).
- `STABLE_PAGE_TIMEOUT` — quiet period (ms) with no DOM mutations before snapshot (default `500`).
- `TMP_DIR` — progress flag directory (default `./tmp`).
- `LOG_DIR`, `LOG_FILE`, `LOG_LEVEL` — log destination and enabled levels (`log`, `info`, `warn`, `error`; inline `//` comments are ignored).
- `USER_AGENT` — optional custom UA applied to page requests; omit to use Puppeteer's default.
- `SNAPSHOT` — toggles snapshot helper if you wire `PageRenderer.persistHtmlSnapshot` into the flow; filenames are URL-safe and truncated to 120 chars.
- `STRIP_CSS` — when `true`, remove `<link rel="stylesheet">` and `<style>` during cleaning; when `false`, keep them.

## API
- **GET /render?url=ENCODED_HTTP_URL** → `text/html`
  - Validates the `url` is HTTP/HTTPS. Returns cleaned HTML with injected JSON-LD.
  - Failures return HTTP 4xx/5xx with JSON body `{ "error": "message" }`.
- **GET /progress** → `{ "progress": 0 | 1 }`
  - Reflects whether a render is running (file-backed flag reset even on errors).

## Rendering Pipeline
- Launch headless Chromium with `--no-sandbox` and intercept requests to drop heavy/analytics resources.
- Await DOM stability (`MutationObserver` + quiet timer) within the global timeout, then pull the full document via CDP.
- Clean HTML (`src/reduce/index.js`): optionally strip CSS tags when `STRIP_CSS=true`, remove disallowed tags/attrs, keep
meaningful classes, drop non-description meta tags, ensure `<base>` and canonical, collapse empty wrappers, normalize whitespace and
nbsp.
- Generate JSON-LD (`src/ldgen/jsonLdBuilder.js`): Organization + WebSite + heuristically typed WebPage (ItemPage, CollectionPage, SearchResultsPage, etc.) based on existing meta and path heuristics; injects into `<head>`.

## Logging & Debugging
- Logger (`src/services/logger.js`) writes `[ISO][LEVEL]` entries to `LOG_DIR/LOG_FILE`; falls back to console on write failures.
- Include `log` in `LOG_LEVEL` to trace every intercepted request.
- Snapshot helper (`PageRenderer.persistHtmlSnapshot`) is available for wiring when `SNAPSHOT=true`; filenames are sanitized from hostname/path and saved under `LOG_DIR`.

## Development
- Entrypoint: `src/server.js`, Express app in `src/app.js`, routes in `src/routes/renderRoute.js`.
- Progress tracking: `src/utils/processTracker.js` (file `tmp/process`).
- Node ESM; lint via `npm run check`; tests via `npm test` when present.
