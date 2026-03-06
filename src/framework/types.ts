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

