export function uniq<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_SCRAPE_DELAY_MIN_MS = 10_000;
const DEFAULT_SCRAPE_DELAY_MAX_MS = 20_000;

/** Random delay (ms) between article URL requests to reduce IP blocking risk. */
export function randomScrapeDelayMs(
  minMs = parseInt(process.env.SCRAPE_DELAY_MIN_MS ?? String(DEFAULT_SCRAPE_DELAY_MIN_MS), 10),
  maxMs = parseInt(process.env.SCRAPE_DELAY_MAX_MS ?? String(DEFAULT_SCRAPE_DELAY_MAX_MS), 10)
): number {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Sleep a random 10–20s (configurable) before the next article URL. */
export async function sleepBetweenArticles(): Promise<void> {
  const ms = randomScrapeDelayMs();
  console.error(`Waiting ${(ms / 1000).toFixed(1)}s before next URL...`);
  await sleep(ms);
}

export function safeString(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const s = x.trim();
  return s.length ? s : undefined;
}

