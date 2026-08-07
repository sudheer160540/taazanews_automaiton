import type { Browser, BrowserContext, Page } from "playwright";
import type { AutomateSourceConfig, NewsItem, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import {
  blockHeavyResources,
  closeQuietly,
  createLeanContext,
  launchLeanBrowser,
} from "../framework/playwright.js";
import { safeString, sleepBetweenArticles, uniq } from "../framework/utils.js";

const BASE_URL = "https://ntvtelugu.com";
const GOTO_TIMEOUT_MS = 30000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 15000;

function isArticleUrl(href: string): boolean {
  const normalized = href.split("?")[0];
  if (!normalized.startsWith(`${BASE_URL}/news/`)) return false;
  if (normalized.includes("/news/page/")) return false;
  // .../slug-1001873.html
  return /-\d{5,}\.html$/i.test(normalized);
}

function buildListUrl(baseUrl: string, page: number): string {
  const normalized = baseUrl.replace(/\/$/, "");
  if (/-\d{5,}\.html$/i.test(normalized)) {
    return `${BASE_URL}/news/page/${page}`;
  }
  if (/\/page\/\d+\/?$/i.test(normalized)) {
    return normalized.replace(/\/page\/\d+\/?$/i, `/page/${page}`);
  }
  return `${normalized}/page/${page}`;
}

function startPageFromUrl(url: string): number {
  const m = url.match(/\/page\/(\d+)\/?$/i);
  return m ? parseInt(m[1], 10) : 1;
}

async function collectArticleLinks(page: Page): Promise<string[]> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  let rawLinks = await page
    .locator(".column-listing ul li a[href]")
    .evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));

  if (rawLinks.length === 0) {
    rawLinks = await page
      .locator(`a[href*='${BASE_URL}/news/']`)
      .evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));
  }

  return uniq(rawLinks.map((x) => x.split("?")[0]).filter(isArticleUrl));
}

async function extractArticleBody(page: Page): Promise<string | undefined> {
  await page.waitForSelector(".detailBody p", { timeout: 8000 }).catch(() => {});

  const fromParagraphs = await page
    .locator(".detailBody")
    .first()
    .evaluate((root) => {
      // Keep this callback free of nested functions — tsx/esbuild injects __name
      // helpers that break inside Playwright's browser context.
      const skipInside = [
        ".article-social-share",
        ".publish-time",
        ".article-img",
        ".footer-social-wrap",
        ".desktop-ads",
        ".mobile_adsCont",
        ".adsCont",
        ".related-posts-box",
        ".tag-wrap",
        ".wp-channel",
        "#taboola-below-article-thumbnails",
        "#taboola-below-widget",
        ".amp-only",
        "script",
        "style",
      ];

      const parts = [];
      for (const p of root.querySelectorAll("p")) {
        let skipped = false;
        for (let i = 0; i < skipInside.length; i++) {
          if (p.closest(skipInside[i])) {
            skipped = true;
            break;
          }
        }
        if (skipped) continue;

        const t = (p.textContent ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (t.length < 20) continue;
        if (/^Also Read|^Tags$|^Follow Us|^Published Date/i.test(t)) continue;
        if (/^A post shared by /i.test(t)) continue;

        parts.push(t);
      }
      return parts.join("\n\n");
    })
    .catch((err) => {
      console.error(
        `[ntv] extractArticleBody evaluate failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return "";
    });

  if (fromParagraphs.trim()) {
    return safeString(fromParagraphs);
  }

  const fallback = await page.locator(".detailBody").first().innerText().catch(() => "");
  const cleaned = fallback
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 40 &&
        !/^(Also Read|Tags|Follow Us|Published Date|Home|Sports)/i.test(line) &&
        !/^By\s+/i.test(line) &&
        !/^A post shared by /i.test(line)
    )
    .join("\n\n");
  return safeString(cleaned);
}

async function scrapeArticle(context: BrowserContext, url: string): Promise<NewsItem> {
  const page = await context.newPage();
  try {
    await blockHeavyResources(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForSelector(".detailBody h1.articleHD, h1.articleHD", {
      timeout: ARTICLE_SELECTOR_TIMEOUT_MS,
    });

    const title = safeString(
      await page.locator(".detailBody h1.articleHD, h1.articleHD").first().textContent().catch(() => null)
    );

    const publishedRaw = safeString(
      await page.locator(".detailBody .publish-time time").first().innerText().catch(() => null)
    );

    const summary = safeString(
      await page.locator(".detailBody .excerpt, .column-listing .excerpt").first().innerText().catch(() => null)
    );

    const body = await extractArticleBody(page);
    if (!body) {
      const pCount = await page.locator(".detailBody p").count().catch(() => -1);
      console.error(`[ntv] empty contentText for ${url} (${pCount} p tags in .detailBody)`);
    }

    return {
      source: "ntv",
      type: "automate",
      url,
      title,
      publishedAt: publishedRaw,
      contentText: body,
      summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: "ntv", type: "automate", url, error: message };
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
  console.error(`[ntv] recycling browser context after ${articlesDone} articles`);
  await closeQuietly(context);
  return createLeanContext(browser);
}

export async function scrapeNtvAutomate(
  cfg: AutomateSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };
  const max = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : 10;
  const recycleEvery = parseInt(process.env.NTV_CONTEXT_RECYCLE_EVERY ?? "5", 10) || 5;

  const browser = await launchLeanBrowser();
  let listContext: BrowserContext | null = null;
  let scrapeContext: BrowserContext | null = null;

  try {
    const targets: string[] = [];
    let pageNum = startPageFromUrl(cfg.url);

    while (targets.length < max) {
      const listUrl = buildListUrl(cfg.url, pageNum);
      console.error(`[ntv] loading list page ${pageNum}: ${listUrl}`);

      if (!listContext) {
        listContext = await createLeanContext(browser);
      }
      const listPage = await listContext.newPage();
      await blockHeavyResources(listPage);
      await listPage.goto(listUrl, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });

      const links = await collectArticleLinks(listPage);
      await closeQuietly(listPage);

      console.error(`[ntv] page ${pageNum}: ${links.length} article links`);
      if (links.length === 0) break;

      for (const link of links) {
        if (targets.includes(link)) continue;
        targets.push(link);
        if (targets.length >= max) break;
      }

      pageNum += 1;
    }

    await closeQuietly(listContext);
    listContext = null;

    if (targets.length === 0) {
      console.error("[ntv] no article links found");
      stats.skipped += 1;
      return stats;
    }

    console.error(`[ntv] Scraping ${targets.length} articles...`);
    scrapeContext = await createLeanContext(browser);

    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.error(`[ntv] [${i + 1}/${targets.length}] ${url}`);
      scrapeContext = await maybeRecycleContext(browser, scrapeContext, i, recycleEvery);

      const item = await scrapeArticle(scrapeContext, url);
      if (item.error) {
        stats.skipped += 1;
        console.error(`[ntv] scrape error: ${item.error}`);
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
