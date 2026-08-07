import type { AutomateSourceConfig, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import { scrapeEenaduAutomate } from "./eenaduAutomate.js";
import { scrapeSakshiAutomate } from "./sakshiAutomate.js";
import { scrapeNtvAutomate } from "./ntvAutomate.js";

export async function scrapeAutomate(
  source: AutomateSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  switch (source.source) {
    case "eenadu":
      return await scrapeEenaduAutomate(source, options);
    case "sakshi":
      return await scrapeSakshiAutomate(source, options);
    case "ntv":
      return await scrapeNtvAutomate(source, options);
    default:
      console.error(`No automate handler for source '${source.source}'`);
      return { scraped: 0, posted: 0, postFailed: 0, skipped: 1 };
  }
}
