export type SourceType = "rss" | "automate" | "json";

export interface SourceConfigBase {
  source: string; // e.g. "eenadu", "toi", "andhrajyothy"
  type: SourceType;
  url: string;
}

export interface RssSourceConfig extends SourceConfigBase {
  type: "rss";
}

export interface AutomateSourceConfig extends SourceConfigBase {
  type: "automate";
  /** Optional: max articles to scrape for this source. 0/undefined = all. */
  maxItems?: number;
}

export interface JsonSourceConfig extends SourceConfigBase {
  type: "json";
  /** CMS JSON page size (default 10). API: ?page=1, ?page=2, ... */
  pageSize?: number;
  /** First page to fetch (default 1). */
  startPage?: number;
  /** Max articles to scrape across pages. */
  maxItems?: number;
  /** Site origin for relative article paths (default https://www.andhrajyothy.com). */
  domain?: string;
}

export type SourceConfig = RssSourceConfig | AutomateSourceConfig | JsonSourceConfig;

export interface NewsItem {
  source: string;
  type: SourceType;
  url: string;
  title?: string;
  publishedAt?: string;
  summary?: string;
  contentText?: string;
  error?: string;
}

/** Called after each scraped article — used to POST to API one at a time. */
export type ArticleSink = (item: NewsItem) => Promise<void>;

export interface ScrapeOptions {
  onItem?: ArticleSink;
}

export interface ScrapeStats {
  scraped: number;
  posted: number;
  postFailed: number;
  skipped: number;
}

