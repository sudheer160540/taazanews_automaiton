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
