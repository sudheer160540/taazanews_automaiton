export type SourceType = "rss" | "automate";

export interface SourceConfigBase {
  source: string; // e.g. "eenadu", "toi"
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

export type SourceConfig = RssSourceConfig | AutomateSourceConfig;

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

