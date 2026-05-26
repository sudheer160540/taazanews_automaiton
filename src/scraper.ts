import { chromium, type Page } from "playwright";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { sleepBetweenArticles } from "./framework/utils.js";

const LIST_URL = "https://www.eenadu.net/latest-news-list";
const OUTPUT_FILE = "output/articles.json";
const BASE_URL = "https://www.eenadu.net";
const GOTO_TIMEOUT_MS = 20000;
const SELECTOR_TIMEOUT_MS = 15000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 10000;

/** Limit number of articles to scrape (set to 0 or omit to scrape all). */
const MAX_ARTICLES = process.env.MAX_ARTICLES ? parseInt(process.env.MAX_ARTICLES, 10) : 0;

export interface ArticleResult {
  url: string;
  title?: string;
  published?: string;
  body?: string;
  error?: string;
}

const LOAD_MORE_DELAY_MS = 2500;
const MAX_LOAD_MORE_CLICKS = 200;

/**
 * Click the "మరిన్ని" (Load more) button until it disappears; load all article chunks.
 */
async function clickLoadMoreUntilGone(page: Page): Promise<void> {
  const loadMoreSelectors = [
    "#loadmore button",
    "#loadmore",
    'button:has-text("మరిన్ని")',
    '.lm-btn button',
  ];

  for (let i = 0; i < MAX_LOAD_MORE_CLICKS; i++) {
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
    await new Promise((r) => setTimeout(r, 300));

    const countBefore = await page.locator("a[href*='eenadu.net/telugu-news']").count();
    await btn.click({ timeout: 8000, force: true }).catch(() => {});
    await new Promise((r) => setTimeout(r, LOAD_MORE_DELAY_MS));
    await page.waitForLoadState("networkidle").catch(() => {});

    const countAfter = await page.locator("a[href*='eenadu.net/telugu-news']").count();
    console.error(`Load more ${i + 1}: ${countBefore} -> ${countAfter} links`);
    if (countAfter <= countBefore) break;
  }
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
  // Article URLs end with /MMDD/numericId (e.g. /1701/126013137)
  if (!/\/\d{4}\/\d{5,}/.test(href.replace(/\?.*/, ""))) return false;
  return true;
}

/**
 * Collect all article hrefs from the latest-news-list page.
 * Tries sidebar selector first, then falls back to any article links in main content.
 */
async function getArticleLinks(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle").catch(() => {});

  const selectors = [
    "div.cl-mid-mrb ul li.tumb-ct div.tumb-dis a[href]",
    "ul li.tumb-ct a[href*='eenadu.net']",
  ];

  let rawLinks: string[] = [];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, {
        timeout: 8000,
        state: "attached",
      });
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

  const links = rawLinks.filter(isArticleUrl);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const href of links) {
    const normalized = href.split("?")[0];
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(href);
    }
  }
  return deduped;
}

/**
 * Visit an article URL and extract title, published metadata, and body.
 */
async function getArticleContent(page: Page, url: string): Promise<ArticleResult> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });

    await page.waitForSelector("div.text-justify, h1.red.fnt-txt", {
      timeout: ARTICLE_SELECTOR_TIMEOUT_MS,
    });

    const title = await page
      .locator("h1.red.fnt-txt")
      .first()
      .textContent()
      .then((s) => s?.trim() ?? undefined)
      .catch(() => undefined);

    const published = await page
      .locator(".pub-sec.pub-t")
      .first()
      .innerText()
      .then((s) => s?.trim() ?? undefined)
      .catch(() => undefined);

    const body = await page
      .locator("div.text-justify")
      .first()
      .innerText()
      .then((s) => s?.trim() ?? undefined)
      .catch(() => undefined);

    return { url, title, published, body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, error: message };
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(LIST_URL, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });

    await clickLoadMoreUntilGone(page);
    const links = await getArticleLinks(page);
    const toScrape =
      MAX_ARTICLES > 0 ? links.slice(0, MAX_ARTICLES) : links;

    console.error(`Found ${links.length} article links. Scraping ${toScrape.length}...`);

    const results: ArticleResult[] = [];
    for (let i = 0; i < toScrape.length; i++) {
      const url = toScrape[i];
      console.error(`[${i + 1}/${toScrape.length}] ${url}`);
      const article = await getArticleContent(page, url);
      results.push(article);
      if (i < toScrape.length - 1) {
        await sleepBetweenArticles();
      }
    }

    const json = JSON.stringify(results, null, 2);
    const outDir = dirname(OUTPUT_FILE);
    await mkdir(outDir, { recursive: true });
    await writeFile(OUTPUT_FILE, json, "utf-8");
    console.error(`Wrote ${results.length} articles to ${OUTPUT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
