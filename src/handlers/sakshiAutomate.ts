import type { Browser, BrowserContext, Page } from "playwright";
import type { AutomateSourceConfig, NewsItem, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import {
  blockHeavyResources,
  closeQuietly,
  createLeanContext,
  launchLeanBrowser,
} from "../framework/playwright.js";
import { safeString, sleepBetweenArticles, uniq } from "../framework/utils.js";

const BASE_URL = "https://www.sakshi.com";
const GOTO_TIMEOUT_MS = 30000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 15000;

function isArticleUrl(href: string): boolean {
  const normalized = href.split("?")[0];
  if (!normalized.startsWith(`${BASE_URL}/telugu-news/`)) return false;
  if (normalized.includes("/latest_stories")) return false;
  if (normalized.includes("/videos/")) return false;
  if (normalized.includes("/web-stories/")) return false;
  if (normalized.includes("/photo/")) return false;
  // .../slug-2866689
  return /-\d{5,}$/.test(normalized);
}

async function collectArticleLinks(page: Page): Promise<string[]> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  let rawLinks = await page
    .locator("a.news_link[href]")
    .evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));

  if (rawLinks.length === 0) {
    rawLinks = await page
      .locator(`a[href*='${BASE_URL}/telugu-news/']`)
      .evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));
  }

  return uniq(rawLinks.map((x) => x.split("?")[0]).filter(isArticleUrl));
}

async function scrapeArticle(context: BrowserContext, url: string): Promise<NewsItem> {
  const page = await context.newPage();
  try {
    await blockHeavyResources(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForSelector("h1.news-heading, .news-story-body", {
      timeout: ARTICLE_SELECTOR_TIMEOUT_MS,
    });

    const title = safeString(
      await page.locator("h1.news-heading").first().textContent().catch(() => null)
    );

    const publishedRaw =
      safeString(
        await page.locator("h1.news-heading + p").first().innerText().catch(() => null)
      ) ??
      safeString(await page.locator("span.date").first().innerText().catch(() => null)) ??
      safeString(await page.locator("time").first().innerText().catch(() => null));

    const body = safeString(
      await page.locator(".news-story-body").first().innerText().catch(() => null)
    );

    return {
      source: "sakshi",
      type: "automate",
      url,
      title,
      publishedAt: publishedRaw,
      contentText: body,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: "sakshi", type: "automate", url, error: message };
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
  console.error(`[sakshi] recycling browser context after ${articlesDone} articles`);
  await closeQuietly(context);
  return createLeanContext(browser);
}

export async function scrapeSakshiAutomate(
  cfg: AutomateSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };
  const max = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : 0;
  const recycleEvery = parseInt(process.env.SAKSHI_CONTEXT_RECYCLE_EVERY ?? "5", 10) || 5;

  const browser = await launchLeanBrowser();
  let listContext: BrowserContext | null = null;
  let scrapeContext: BrowserContext | null = null;

  try {
    listContext = await createLeanContext(browser);
    const listPage = await listContext.newPage();
    await blockHeavyResources(listPage);

    await listPage.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    const links = await collectArticleLinks(listPage);

    await closeQuietly(listPage);
    await closeQuietly(listContext);
    listContext = null;

    const targets = max > 0 ? links.slice(0, max) : links.slice(0, 25);
    console.error(`[sakshi] Found ${links.length} links. Scraping ${targets.length}...`);

    scrapeContext = await createLeanContext(browser);

    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.error(`[sakshi] [${i + 1}/${targets.length}] ${url}`);
      scrapeContext = await maybeRecycleContext(browser, scrapeContext, i, recycleEvery);

      const item = await scrapeArticle(scrapeContext, url);
      if (item.error) {
        stats.skipped += 1;
        console.error(`[sakshi] scrape error: ${item.error}`);
      } else {
        stats.scraped += 1;
        if (options?.onItem) await options.onItem(item);
      }

      if (i < targets.length - 1) await sleepBetweenArticles();
    }

    return stats;
  } finally {
    await closeQuietly(scrapeContext);
    await closeQuietly(listContext);
    await closeQuietly(browser);
  }
}
