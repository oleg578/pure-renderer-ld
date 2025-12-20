# PureRenderer-LD

Self-hosted SEO prerenderer that turns any URL into a lean HTML snapshot with first-party JSON-LD—keep your crawl equity, lose the third-party bill.

## Why teams pick it
- Ship SEO-ready pages without surrendering traffic or data to hosted proxies.
- Consistent, lightweight snapshots crawlers love: scripts stripped, metadata normalized, JSON-LD injected.
- Deterministic renders: throttled network, blocked noise (analytics/AB), DOM stability wait, CDP outerHTML pull.
- Ops-friendly: single Node service, file-backed progress flag, optional snapshots for postmortems.

## Who it fits
- Product teams replacing prerender.io / Rendertron with something they own.
- Agencies that need reliable, repeatable captures for large catalogs.
- Growth/SEO engineers who want structured data generated even when sites only expose Microdata.

## 5‑minute start
- Prereq: Node.js **>= 18.18** (Puppeteer fetches Chromium on first install).
- Install: `npm install`
- Configure: `cp .env.example .env` and tune the knobs below.
- Run: `npm start` (prod) or `npm run dev` (watch). Checks: `npm run check`. Tests: `npm test` when present.

## Configuration (env)
- `SERVER_HOST` / `SERVER_PORT` — bind address (default `127.0.0.1:51000`).
- `SERVER_TIMEOUT_MS` — global timeout and max DOM-stability wait (default `60000`).
- `FETCH_HTML_TIMEOUT` — CDP outerHTML fetch timeout (default `1000`).
- `STABLE_PAGE_TIMEOUT` — quiet window for the MutationObserver (default `500`).
- `TMP_DIR` — progress flag directory (default `./tmp`).
- `LOG_DIR`, `LOG_FILE`, `LOG_LEVEL` — destination + levels (`log`, `info`, `warn`, `error`; `//` comments ignored).
- `USER_AGENT` — spoof when targets gate content.
- `SNAPSHOT` — enable sanitized on-disk snapshots via `PageRenderer.persistHtmlSnapshot`.
- `STRIP_CSS` — `true` to drop stylesheets/styles in cleaning, `false` to keep.

## API
- `GET /render?url=ENCODED_HTTP_URL` → `text/html`
  - Validates HTTP/HTTPS. Returns cleaned HTML with injected JSON-LD.
  - Errors come back as `{ "error": "message" }` with 4xx/5xx.
- `GET /progress` → `{ "progress": 0 | 1 }`
  - Reflects an in-flight render (file-backed flag reset even on errors).

## How it wins
- Launches headless Chromium (`--no-sandbox`), blocks heavy/analytics requests for fast, stable output.
- Waits for DOM stability (MutationObserver + quiet timer), then grabs the document via CDP `DOM.getOuterHTML` to dodge Puppeteer timing quirks.
- Cleans HTML (`src/reduce/index.js`): optional CSS stripping, removes unsafe tags/attrs, keeps meaningful classes, enforces `<base>` + canonical, collapses empty wrappers, reduce "div soup".
- Generates JSON-LD (`src/services/pageRenderer.js`): upgrades Microdata when present; otherwise synthesizes Organization + WebSite + typed WebPage (ItemPage, CollectionPage, SearchResultsPage, etc.) and injects into `<head>`.

## Observability
- Logger (`src/services/logger.js`) writes `[ISO][LEVEL]` to `LOG_DIR/LOG_FILE`, falling back to console if the file system fails.
- Include `log` in `LOG_LEVEL` to trace every intercepted request.
- Optional snapshots (when `SNAPSHOT=true`) save sanitized filenames under `LOG_DIR` for audit/debug.

## Dev map
- Entrypoint `src/server.js`; Express app `src/app.js`; routes `src/routes/renderRoute.js`.
- Progress tracking lives in `src/utils/processTracker.js` (file `tmp/process`).
- Node ESM; lint with `npm run check`; run tests with `npm test` when present.
