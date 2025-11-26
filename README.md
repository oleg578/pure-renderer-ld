# PureRenderer-LD

Lightweight headless rendering service that turns any HTTP(S) page into a cleaned, SEO-friendly HTML snapshot. It drives headless Chromium via Puppeteer, strips noise, injects JSON-LD metadata, and exposes a tiny HTTP API for downstream pipelines.

## Highlights

- Headless fetch with aggressive request filtering to drop fonts, stylesheets, media, and common analytics for faster, repeatable snapshots (`src/services/pageRenderer.js`).
- DOM stability detection before snapshotting using a `MutationObserver`, followed by a direct CDP `DOM.getOuterHTML` pull to avoid Puppeteer timing quirks.
- HTML reduction pipeline that removes unsafe tags/attributes, collapses empty wrappers, enforces canonical/base tags, and normalizes whitespace for easy parsing (`src/reduce/index.js`).
- Auto-generated JSON-LD graph (Organization, WebSite, and a heuristically derived page type) built from existing meta tags and canonical URLs (`src/ldgen/jsonLdBuilder.js`).
- File-backed progress flag exposed via `GET /progress`, useful for coordinating orchestration steps (`src/utils/processTracker.js`).
- File-based logging with configurable levels and locations (`src/services/logger.js`).
- Snapshot helper ready for wiring when `SNAPSHOT=true` to persist raw/clean HTML to disk for debugging.

## How It Works

1. `POST /render` accepts a `url` (URL-encoded form field). The URL is validated to HTTP/HTTPS.
2. `ProcessTracker` marks work as in-flight (`tmp/process`), allowing `GET /progress` to reflect busy/idle state.
3. `PageRenderer` launches headless Chromium, blocks non-essential requests, disables animations, waits for DOM stability, and grabs the full HTML via the Chrome DevTools Protocol.
4. The HTML is cleaned: scripts/styles/forms/nav/svg/etc. are stripped, only safe attributes remain, meaningless wrapper divs are collapsed, whitespace is normalized, and canonical/base tags are ensured.
5. JSON-LD is generated from page metadata and injected into `<head>` before returning the final HTML.
6. The progress flag resets to idle even on errors; HTTP errors are normalized to JSON responses.

## Getting Started

Prerequisites: Node.js >= 18.18 (Puppeteer will download Chromium on first install).

### Install dependencies

```bash
npm install
```

### Configure environment

Copy defaults and adjust as needed:

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

### Run the server

```bash
npm start            # production
npm run dev          # reload on change
npm run check        # syntax check
```

## Configuration

Set via `.env` (see `.env.example` for defaults):

- `SERVER_HOST` / `SERVER_PORT` – bind address and port (default `127.0.0.1:51000`).
- `SERVER_TIMEOUT_MS` – overall request timeout (default `60000` ms).
- `FETCH_HTML_TIMEOUT` – timeout for the CDP HTML fetch step (default `1000` ms).
- `STABLE_PAGE_TIMEOUT` – required idle period with no DOM mutations before snapshotting (default `500` ms).
- `TMP_DIR` – location for the progress flag file (default `./tmp`).
- `LOG_DIR`, `LOG_FILE`, `LOG_LEVEL` – log destination and enabled levels (`log, info, warn, error`).
- `SNAPSHOT` – when true, enables the HTML snapshot helper (wire `persistHtmlSnapshot` where desired).

## API Usage

### Render and clean a page

```bash
curl -X POST http://127.0.0.1:51000/render \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "url=https://example.com/products/1"
```

Returns `text/html` with stripped noise and injected JSON-LD.

### Check render progress

```bash
curl http://127.0.0.1:51000/progress
```

Returns `{"progress":0}` when idle or `{"progress":1}` while a render is running.

## Testing

- Unit tests (jsdom, built-in test runner): `npm test`
- Static syntax check for `src/server.js`: `npm run check`

## Logging

The service uses a file-based logger (`src/services/logger.js`) that writes timestamped entries to disk:

- **Location**: Configured via `LOG_DIR` and `LOG_FILE` environment variables
- **Levels**: `log`, `info`, `warn`, `error` (filter via `LOG_LEVEL`)
- **Format**: `[ISO timestamp] [LEVEL] message`
- **Behavior**:
  - Automatically creates log directory if missing
  - Appends to log file (doesn't rotate)
  - Silently falls back to console on write failures
  - Uses `util.formatWithOptions` for structured output

**Example configuration**:

```env
LOG_DIR=./log
LOG_FILE=app.log
LOG_LEVEL=info,warn,error
```

To enable verbose Puppeteer request traces, include `log` in `LOG_LEVEL`.

## Notes

- Request bodies are URL-encoded (`express.urlencoded`); send `Content-Type: application/x-www-form-urlencoded` in clients.
