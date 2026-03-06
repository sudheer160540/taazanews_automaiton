import { XMLParser } from "fast-xml-parser";
import type { NewsItem, RssSourceConfig } from "../framework/types.js";
import { safeString } from "../framework/utils.js";

type AnyObj = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function scrapeRss(source: RssSourceConfig): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  try {
    const res = await fetch(source.url, {
      headers: {
        "user-agent": "playwrite_demo/1.0 (+rss-scraper)",
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
    });
    if (!res.ok) {
      return [
        {
          source: source.source,
          type: source.type,
          url: source.url,
          error: `RSS fetch failed: ${res.status} ${res.statusText}`,
        },
      ];
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
    });
    const doc = parser.parse(xml) as AnyObj;

    // RSS2: doc.rss.channel.item[]
    const rssChannel = (doc.rss as AnyObj | undefined)?.channel as AnyObj | undefined;
    const rssItems = asArray((rssChannel?.item as AnyObj[] | AnyObj | undefined) as any);

    // Atom: doc.feed.entry[]
    const atomEntries = asArray(((doc.feed as AnyObj | undefined)?.entry as any) as any);

    const items = rssItems.length ? rssItems : atomEntries;
    for (const it of items) {
      const obj = it as AnyObj;

      const title = safeString(obj.title);
      const link =
        safeString(obj.link) ||
        safeString((obj.link as AnyObj | undefined)?.["@_href"]) ||
        safeString((obj.link as AnyObj | undefined)?.href);
      const description = safeString(obj.description) || safeString(obj.summary);
      const pubDate =
        safeString(obj.pubDate) ||
        safeString(obj.published) ||
        safeString(obj.updated) ||
        safeString((obj["dc:date"] as unknown) as string);

      results.push({
        source: source.source,
        type: source.type,
        url: link ?? source.url,
        title,
        publishedAt: pubDate,
        summary: description,
      });
    }

    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        source: source.source,
        type: source.type,
        url: source.url,
        error: `RSS parse error: ${message}`,
      },
    ];
  }
}

