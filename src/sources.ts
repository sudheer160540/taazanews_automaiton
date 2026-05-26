import type { SourceConfig } from "./framework/types.js";

/**
 * Add websites here. The runner will iterate this array.
 *
 * Types:
 * - rss: expects `url` to be an RSS/Atom XML endpoint
 * - automate: uses a site-specific Playwright scraper keyed by `source`
 */
export const SOURCES: SourceConfig[] = [
  {
    source: "eenadu",
    type: "automate",
    url: "https://www.eenadu.net/latest-news-list",
    maxItems: 20,
  },
  // {
  //   source: "toi",
  //   type: "rss",
  //   url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
  // },
];

