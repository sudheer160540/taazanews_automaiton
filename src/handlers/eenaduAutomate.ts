import type { Browser, BrowserContext, Page } from "playwright";
import type { AutomateSourceConfig, NewsItem, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import {
  blockHeavyResources,
  closeQuietly,
  createLeanContext,
  launchLeanBrowser,
} from "../framework/playwright.js";
import { safeString, sleep, sleepBetweenArticles, uniq } from "../framework/utils.js";

const BASE_URL = "https://www.eenadu.net";
const GOTO_TIMEOUT_MS = 30000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 15000;
const LOAD_MORE_DELAY_MS = 2000;
const DEFAULT_MAX_LOAD_MORE_CLICKS = 12;
const LINKS_PER_LOAD_MORE_ESTIMATE = 25;

function maxLoadMoreClicks(): number {
  const n = parseInt(process.env.EENADU_MAX_LOAD_MORE ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_LOAD_MORE_CLICKS;
}

function isArticleUrl(href: string): boolean {
  if (!href.startsWith(BASE_URL + "/")) return false;
  if (href.includes("/latest-news-list")) return false;
  if (href.includes("/videos/")) return false;
  if (href.includes("/web-stories/")) return false;
  if (href.includes("/topic/")) return false;
  if (href.includes("/breaking-news")) return false;
  if (href.includes("/feedback")) return false;
  if (href.includes("/search")) return false;
  if (!/\/\d{4}\/\d{5,}/.test(href.replace(/\?.*/, ""))) return false;
  return true;
}

async function collectArticleLinks(page: Page): Promise<string[]> {
  const selectors = [
    "div.cl-mid-mrb ul li.tumb-ct div.tumb-dis a[href]",
    "ul li.tumb-ct a[href*='eenadu.net']",
  ];

  let rawLinks: string[] = [];
  for (const sel of selectors) {
    try {
      rawLinks = await page.locator(sel).evaluateAll((anchors: HTMLAnchorElement[]) =>
        anchors.map((a) => a.href)
      );
      if (rawLinks.length > 0) break;
    } catch {
      continue;
    }
  }

  if (rawLinks.length === 0) {
    rawLinks = await page
      .locator("a[href*='eenadu.net/telugu-news']")
      .evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));
  }

  return uniq(rawLinks.map((x) => x.split("?")[0]).filter(isArticleUrl));
}

/**
 * Click "load more" only until we have enough article links — never load the full list.
 * Loading the entire list DOM was the main cause of 2Gi+ OOM on Render.
 */
async function loadMoreUntilEnoughLinks(page: Page, neededCount: number): Promise<string[]> {
  const loadMoreSelectors = [
    "#loadmore button",
    "#loadmore",
    'button:has-text("మరిన్ని")',
    ".lm-btn button",
  ];
  const maxClicks = maxLoadMoreClicks();
  const target = neededCount + 5;

  let links = await collectArticleLinks(page);
  console.error(`[eenadu] initial links: ${links.length} (need ${neededCount})`);

  for (let i = 0; i < maxClicks && links.length < target; i++) {
    let btn = page.locator(loadMoreSelectors[0]);
    let visible = await btn.isVisible().catch(() => false);
    if (!visible) {
      for (const sel of loadMoreSelectors.slice(1)) {
        btn = page.locator(sel);
        visible = await btn.isVisible().catch(() => false);
        if (visible) break;
      }
    }
    if (!visible) break;

    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);

    const countBefore = links.length;
    await btn.click({ timeout: 10000, force: true }).catch(() => {});
    await sleep(LOAD_MORE_DELAY_MS);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    links = await collectArticleLinks(page);
    console.error(`[eenadu] loadmore ${i + 1}: ${countBefore} -> ${links.length}`);
    if (links.length <= countBefore) break;
  }

  return links;
}

async function scrapeArticle(context: BrowserContext, url: string): Promise<NewsItem> {
  const page = await context.newPage();
  try {
    await blockHeavyResources(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForSelector("div.text-justify, h1.red.fnt-txt", {
      timeout: ARTICLE_SELECTOR_TIMEOUT_MS,
    });

    const title = safeString(await page.locator("h1.red.fnt-txt").first().textContent().catch(() => null));
    const publishedRaw = safeString(
      await page.locator(".pub-sec.pub-t").first().innerText().catch(() => null)
    );
    const body = safeString(await page.locator("div.text-justify").first().innerText().catch(() => null));

    return {
      source: "eenadu",
      type: "automate",
      url,
      title,
      publishedAt: publishedRaw,
      contentText: body,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: "eenadu", type: "automate", url, error: message };
  } finally {
    await closeQuietly(page);
  }
}

/** Recycle browser context every N articles to release Chromium heap. */
async function maybeRecycleContext(
  browser: Browser,
  context: BrowserContext,
  articlesDone: number,
  recycleEvery: number
): Promise<BrowserContext> {
  if (articlesDone === 0 || articlesDone % recycleEvery !== 0) return context;
  console.error(`[eenadu] recycling browser context after ${articlesDone} articles`);
  await closeQuietly(context);
  return createLeanContext(browser);
}

export async function scrapeEenaduAutomate(
  cfg: AutomateSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };
  const max = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : 0;
  const neededLinks = max > 0 ? max : LINKS_PER_LOAD_MORE_ESTIMATE;
  const recycleEvery = parseInt(process.env.EENADU_CONTEXT_RECYCLE_EVERY ?? "5", 10) || 5;

  const browser = await launchLeanBrowser();
  let listContext: BrowserContext | null = null;
  let scrapeContext: BrowserContext | null = null;

  try {
    listContext = await createLeanContext(browser);
    const listPage = await listContext.newPage();
    await blockHeavyResources(listPage);

    await listPage.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    const links = await loadMoreUntilEnoughLinks(listPage, neededLinks);

    await closeQuietly(listPage);
    await closeQuietly(listContext);
    listContext = null;

    const targets = max > 0 ? links.slice(0, max) : links;
    console.error(`[eenadu] Found ${links.length} links. Scraping ${targets.length}...`);

    scrapeContext = await createLeanContext(browser);

    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.error(`[eenadu] [${i + 1}/${targets.length}] ${url}`);
      scrapeContext = await maybeRecycleContext(browser, scrapeContext, i, recycleEvery);

      const item = await scrapeArticle(scrapeContext, url);
      if (item.error) {
        stats.skipped += 1;
        console.error(`[eenadu] scrape error: ${item.error}`);
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
