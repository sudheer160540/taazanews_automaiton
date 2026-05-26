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

- **Path (default):** `output/news.json` (override with `OUTPUT_FILE`)
- **Shape:** Array of `NewsItem` objects:
  - RSS: `{ source, type:'rss', url, title?, publishedAt?, summary?, error? }`
  - Automate: `{ source, type:'automate', url, title?, publishedAt?, contentText?, error? }`

## Adding a new website

1. Add an entry in `src/sources.ts`:

```js
{ source: \"mySite\", type: \"rss\", url: \"https://.../feed.xml\" }
```

2. If it’s `type: \"automate\"`, add a handler in `src/handlers/` and register it in `src/handlers/automate.ts`.
