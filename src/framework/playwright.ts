import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet"]);

/** Chromium flags tuned for low-memory hosts (Render 512MB–2GB). */
const LOW_MEMORY_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--mute-audio",
  "--no-first-run",
  "--disable-component-update",
  "--disable-background-timer-throttling",
];

export async function launchLeanBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: LOW_MEMORY_ARGS,
  });
}

/** Drop images/CSS/fonts — keeps text and scripts only. */
export async function blockHeavyResources(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (BLOCKED_RESOURCE_TYPES.has(type)) {
      route.abort();
      return;
    }
    route.continue();
  });
}

export async function createLeanContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });
  return context;
}

export async function closeQuietly(page: Page | BrowserContext | Browser | null | undefined): Promise<void> {
  try {
    await page?.close();
  } catch {
    // ignore shutdown races
  }
}
