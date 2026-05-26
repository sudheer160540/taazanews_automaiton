import { chromium, type Page } from "playwright";
import type { AutomateSourceConfig, NewsItem } from "../framework/types.js";
import { safeString, sleep, sleepBetweenArticles, uniq } from "../framework/utils.js";

const BASE_URL = "https://www.eenadu.net";
const GOTO_TIMEOUT_MS = 30000;
const ARTICLE_SELECTOR_TIMEOUT_MS = 15000;
const LOAD_MORE_DELAY_MS = 2500;
const MAX_LOAD_MORE_CLICKS = 300;

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

async function clickLoadMoreUntilNoGrowth(page: Page): Promise<void> {
  const loadMoreSelectors = ["#loadmore button", "#loadmore", 'button:has-text("మరిన్ని")', ".lm-btn button"];

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
    await sleep(300);

    const countBefore = await page.locator("a[href*='eenadu.net/telugu-news']").count();
    await btn.click({ timeout: 10000, force: true }).catch(() => {});
    await sleep(LOAD_MORE_DELAY_MS);
    await page.waitForLoadState("networkidle").catch(() => {});

    const countAfter = await page.locator("a[href*='eenadu.net/telugu-news']").count();
    console.error(`[eenadu] loadmore ${i + 1}: ${countBefore} -> ${countAfter}`);
    if (countAfter <= countBefore) break;
  }
}

async function getArticleLinks(page: Page): Promise<string[]> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});

  const selectors = ["div.cl-mid-mrb ul li.tumb-ct div.tumb-dis a[href]", "ul li.tumb-ct a[href*='eenadu.net']"];
  let rawLinks: string[] = [];

  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000, state: "attached" });
      rawLinks = await page.locator(sel).evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map((a) => a.href));
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

async function scrapeArticle(page: Page, url: string): Promise<NewsItem> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await page.waitForSelector("div.text-justify, h1.red.fnt-txt", { timeout: ARTICLE_SELECTOR_TIMEOUT_MS });

    const title = safeString(await page.locator("h1.red.fnt-txt").first().textContent().catch(() => null));
    const publishedRaw = safeString(await page.locator(".pub-sec.pub-t").first().innerText().catch(() => null));
    const body = safeString(await page.locator("div.text-justify").first().innerText().catch(() => null));
console.log({
  source: "eenadu",
  type: "automate",
  url,
  title,
  publishedAt: publishedRaw,
  contentText: body,
})
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
  }
}

export async function scrapeEenaduAutomate(cfg: AutomateSourceConfig): Promise<NewsItem[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(cfg.url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await clickLoadMoreUntilNoGrowth(page);
    const links = await getArticleLinks(page);

    const max = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : 0;
    const targets = max ? links.slice(0, max) : links;
    console.error(`[eenadu] Found ${links.length} article links. Scraping ${targets.length}...`);

    const out: NewsItem[] = [];
    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.error(`[eenadu] [${i + 1}/${targets.length}] ${url}`);
      out.push(await scrapeArticle(page, url));
      if (i < targets.length - 1) await sleepBetweenArticles();
    }
    return out;
  } finally {
    await browser.close();
  }
}

