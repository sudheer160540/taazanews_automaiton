import { XMLParser } from "fast-xml-parser";
import type { NewsItem, RssSourceConfig, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import { safeString } from "../framework/utils.js";

type AnyObj = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function scrapeRss(
  source: RssSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };

  try {
    const res = await fetch(source.url, {
      headers: {
        "user-agent": "playwrite_demo/1.0 (+rss-scraper)",
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
    });
    if (!res.ok) {
      console.error(`[${source.source}] RSS fetch failed: ${res.status} ${res.statusText}`);
      stats.skipped += 1;
      return stats;
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
    });
    const doc = parser.parse(xml) as AnyObj;

    const rssChannel = (doc.rss as AnyObj | undefined)?.channel as AnyObj | undefined;
    const rssItems = asArray((rssChannel?.item as AnyObj[] | AnyObj | undefined) as any);
    const atomEntries = asArray(((doc.feed as AnyObj | undefined)?.entry as any) as any);
    const items = rssItems.length ? rssItems : atomEntries;

    for (const it of items) {
      const obj = it as AnyObj;
      const item: NewsItem = {
        source: source.source,
        type: source.type,
        url:
          safeString(obj.link) ||
          safeString((obj.link as AnyObj | undefined)?.["@_href"]) ||
          safeString((obj.link as AnyObj | undefined)?.href) ||
          source.url,
        title: safeString(obj.title),
        publishedAt:
          safeString(obj.pubDate) ||
          safeString(obj.published) ||
          safeString(obj.updated) ||
          safeString((obj["dc:date"] as unknown) as string),
        summary: safeString(obj.description) || safeString(obj.summary),
      };

      stats.scraped += 1;
      if (options?.onItem) await options.onItem(item);
    }

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${source.source}] RSS error: ${message}`);
    stats.skipped += 1;
    return stats;
  }
}
