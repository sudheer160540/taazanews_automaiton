import type { SourceConfig } from "./framework/types.js";

/**
 * Add websites here. The runner will iterate this array.
 *
 * Types:
 * - rss: fetch XML feed, extract items
 * - automate: Playwright list-page scraper (per-site handler)
 * - json: fetch CMS JSON list (?page=1,2,...), Playwright each article URL
 */
export const SOURCES: SourceConfig[] = [
  {
    source: "eenadu",
    type: "automate",
    url: "https://www.eenadu.net/latest-news-list",
    maxItems: 3,
  },
  {
    source: "sakshi",
    type: "automate",
    url: "https://www.sakshi.com/latest_stories",
    maxItems: 3,
  },
  {
    source: "ntv",
    type: "automate",
    url: "https://ntvtelugu.com/news/page/1",
    maxItems: 3,
  },
  {
    source: "andhrajyothy",
    type: "json",
    url: "https://www.andhrajyothy.com/cms/articles/category/1",
    pageSize: 10,
    startPage: 1,
    maxItems: 3,
    domain: "https://www.andhrajyothy.com",
  },
  // {
  //   source: "toi",
  //   type: "rss",
  //   url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
  // },
];
