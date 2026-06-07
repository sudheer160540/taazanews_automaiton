# Playwright multi-site news scraper (framework)

Framework that supports multiple websites with 2 types:

- **rss**: Fetch XML (RSS/Atom), extract items
- **automate**: Use Playwright to browse and extract article content

All websites are configured in `src/sources.ts` as an array.

## Setup

```bash
npm install
npx playwright install chromium
```

## Deploy on Render (Blueprint)

Yes — you can deploy with `render.yaml` in the repo root. It defines a **cron job** that runs `npm run scrape:built` every 6 hours (UTC).

### Steps

1. Push this repo to GitHub (or GitLab).
2. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect the repo and apply the blueprint (Render reads `render.yaml`).
4. Wait for the first **build** to finish (installs deps, compiles TypeScript, downloads Chromium).
5. Open the **news-scraper** cron service → **Trigger Run** to test immediately (don’t wait for the schedule).

### Will it work?

| Piece | Status |
|--------|--------|
| Blueprint YAML | Valid cron service (`runtime: node`, schedule, build/start commands) |
| Playwright on Render | Fixed via `PLAYWRIGHT_BROWSERS_PATH=0` + `install:browsers` in build |
| TypeScript build | `npm ci --include=dev` so `tsc` is available during build |
| POST to API | Uses `API_URL` → `https://taajanews-api.onrender.com/api/source-articles` |

If the build succeeds but the run fails with missing `.so` libraries (e.g. `libglib`), switch to a **Docker** runtime with the official Playwright image instead of native Node.

### Memory (512MB–2GB instances)

The Eenadu scraper is tuned for low RAM:

- Stops **load more** once enough links are collected (does not load the full list page)
- Blocks images/CSS/fonts in the browser
- Opens a **new page per article** and closes it after scrape
- Recycles the browser context every 5 articles (override with `EENADU_CONTEXT_RECYCLE_EVERY`)

Optional env vars:

| Variable | Default | Purpose |
|----------|---------|---------|
| `EENADU_MAX_LOAD_MORE` | `12` | Max "load more" clicks on list page |
| `EENADU_CONTEXT_RECYCLE_EVERY` | `5` | New browser context every N articles |
| `maxItems` in `sources.ts` | — | Scrape only N articles (e.g. `20`) |

### Manual setup (without Blueprint)

Same env and commands as in `render.yaml`:

- `PLAYWRIGHT_BROWSERS_PATH` = `0`
- Build: `npm ci --include=dev && npm run build && npm run install:browsers`
- Start: `npm run scrape:built`

## Run

```bash
# Run all configured sources
npm run scrape

# Output file override
OUTPUT_FILE=output/news.json npm run scrape
```

## Output

Each article is **POSTed to the API immediately** after it is scraped (not saved in bulk at the end).

- **API:** `POST $API_URL` with a one-item array per article
- **Local file:** off by default. Set `WRITE_OUTPUT_FILE=1` to write a run summary to `OUTPUT_FILE` (counts only, not full articles)
- **Scrape only:** `SKIP_API_POST=1 npm run scrape`

## Adding a new website

1. Add an entry in `src/sources.ts`:

```js
{ source: \"mySite\", type: \"rss\", url: \"https://.../feed.xml\" }
```

2. If it’s `type: \"automate\"`, add a handler in `src/handlers/` and register it in `src/handlers/automate.ts`.
