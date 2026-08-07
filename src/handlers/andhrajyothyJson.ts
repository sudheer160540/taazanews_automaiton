import type { Browser, BrowserContext } from "playwright";
import type { JsonSourceConfig, NewsItem, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import {
  blockHeavyResources,
  closeQuietly,
  createLeanContext,
  launchLeanBrowser,
} from "../framework/playwright.js";
import { safeString, sleepBetweenArticles, formatError } from "../framework/utils.js";

const DEFAULT_DOMAIN = "https://www.andhrajyothy.com";
const GOTO_TIMEOUT_MS = 30000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 15000;
const DEFAULT_PAGE_SIZE = 10;

interface CmsArticleRow {
  id?: number;
  url?: string;
  headline?: string;
  summary?: string;
  publishedAtSm?: string;
  publishedAt?: string;
  author?: string;
}

function absUrl(domain: string, path: string): string {
  if (path.startsWith("http")) return path.split("?")[0];
  return `${domain.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`.split("?")[0];
}

function buildListUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set("page", String(page));
  return u.toString();
}

/** CMS may ignore ?page= — slice locally when a page returns more than pageSize rows. */
function slicePageRows(rows: CmsArticleRow[], page: number, pageSize: number): CmsArticleRow[] {
  if (rows.length <= pageSize) return rows;
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

async function fetchArticleList(
  cfg: JsonSourceConfig,
  page: number,
  pageSize: number
): Promise<CmsArticleRow[]> {
  const listUrl = buildListUrl(cfg.url, page);
  const domain = cfg.domain ?? DEFAULT_DOMAIN;

  let res: Response;
  try {
    res = await fetch(listUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        referer: `${domain}/`,
        origin: domain,
      },
    });
  } catch (err) {
    throw new Error(`JSON fetch network error for ${listUrl}: ${formatError(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `JSON list HTTP ${res.status} ${res.statusText} for ${listUrl}: ${body.slice(0, 300)}`
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new Error(`JSON parse error for ${listUrl}: ${formatError(err)}`);
  }

  if (!Array.isArray(raw)) {
    throw new Error(`JSON list page ${page}: expected array from ${listUrl}`);
  }
  return slicePageRows(raw as CmsArticleRow[], page, pageSize);
}

async function scrapeArticlePage(
  context: BrowserContext,
  fullUrl: string,
  row: CmsArticleRow,
  source: string
): Promise<NewsItem> {
  const page = await context.newPage();
  try {
    await blockHeavyResources(page);
    await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForSelector("div.articleBodyCont, h1.articleHD", {
      timeout: ARTICLE_SELECTOR_TIMEOUT_MS,
    });

    const title =
      safeString(await page.locator("h1.articleHD").first().textContent().catch(() => null)) ??
      safeString(row.headline);

    const publishedRaw =
      safeString(await page.locator(".articleBodyCont .AuthorInfo").first().innerText().catch(() => null)) ??
      safeString(row.publishedAtSm) ??
      safeString(row.publishedAt);

    const body =
      safeString(await page.locator(".articleBodyCont .category_desc").first().innerText().catch(() => null)) ??
      safeString(await page.locator("div.articleBodyCont").first().innerText().catch(() => null));

    return {
      source,
      type: "json",
      url: fullUrl,
      title,
      publishedAt: publishedRaw,
      contentText: body,
      summary: safeString(row.summary),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source, type: "json", url: fullUrl, error: message };
  } finally {
    await closeQuietly(page);
  }
}

async function maybeRecycleContext(
  browser: Browser,
  context: BrowserContext,
  articlesDone: number,
  recycleEvery: number
): Promise<BrowserContext> {
  if (articlesDone === 0 || articlesDone % recycleEvery !== 0) return context;
  console.error(`[andhrajyothy] recycling browser context after ${articlesDone} articles`);
  await closeQuietly(context);
  return createLeanContext(browser);
}

export async function scrapeAndhrajyothyJson(
  cfg: JsonSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };
  const domain = cfg.domain ?? DEFAULT_DOMAIN;
  const pageSize = cfg.pageSize && cfg.pageSize > 0 ? cfg.pageSize : DEFAULT_PAGE_SIZE;
  const startPage = cfg.startPage && cfg.startPage > 0 ? cfg.startPage : 1;
  const maxItems = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : pageSize;
  const recycleEvery = parseInt(process.env.AJ_CONTEXT_RECYCLE_EVERY ?? "5", 10) || 5;

  const targets: { row: CmsArticleRow; fullUrl: string }[] = [];
  const seenIds = new Set<number>();
  let page = startPage;

  while (targets.length < maxItems) {
    console.error(`[andhrajyothy] fetching JSON page ${page} ...`);
    const rows = await fetchArticleList(cfg, page, pageSize);
    if (rows.length === 0) break;

    let added = 0;
    for (const row of rows) {
      if (!row.url) continue;
      if (row.id != null && seenIds.has(row.id)) continue;
      if (row.id != null) seenIds.add(row.id);

      targets.push({ row, fullUrl: absUrl(domain, row.url) });
      added += 1;
      if (targets.length >= maxItems) break;
    }

    console.error(`[andhrajyothy] page ${page}: ${rows.length} rows, added ${added}, total ${targets.length}`);
    if (added === 0) break;
    page += 1;
  }

  if (targets.length === 0) {
    console.error("[andhrajyothy] no articles found in JSON feed");
    stats.skipped += 1;
    return stats;
  }

  const browser = await launchLeanBrowser();
  let scrapeContext: BrowserContext | null = null;

  try {
    scrapeContext = await createLeanContext(browser);

    for (let i = 0; i < targets.length; i++) {
      const { row, fullUrl } = targets[i];
      console.error(`[andhrajyothy] [${i + 1}/${targets.length}] ${fullUrl}`);
      scrapeContext = await maybeRecycleContext(browser, scrapeContext, i, recycleEvery);

      const item = await scrapeArticlePage(scrapeContext, fullUrl, row, cfg.source);
      if (item.error) {
        stats.skipped += 1;
        console.error(`[andhrajyothy] scrape error: ${item.error}`);
      } else {
        stats.scraped += 1;
        if (options?.onItem) await options.onItem(item);
      }

      if (i < targets.length - 1) await sleepBetweenArticles();
    }

    return stats;
  } finally {
    await closeQuietly(scrapeContext);
    await closeQuietly(browser);
  }
}
