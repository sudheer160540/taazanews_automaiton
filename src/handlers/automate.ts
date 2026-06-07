import type { AutomateSourceConfig, NewsItem, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import { scrapeEenaduAutomate } from "./eenaduAutomate.js";

export async function scrapeAutomate(
  source: AutomateSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  switch (source.source) {
    case "eenadu":
      return await scrapeEenaduAutomate(source, options);
    default:
      console.error(`No automate handler for source '${source.source}'`);
      return { scraped: 0, posted: 0, postFailed: 0, skipped: 1 };
  }
}
