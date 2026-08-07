import type { JsonSourceConfig, ScrapeOptions, ScrapeStats } from "../framework/types.js";
import { scrapeAndhrajyothyJson } from "./andhrajyothyJson.js";

export async function scrapeJson(
  source: JsonSourceConfig,
  options?: ScrapeOptions
): Promise<ScrapeStats> {
  switch (source.source) {
    case "andhrajyothy":
    case "aj":
      return await scrapeAndhrajyothyJson(source, options);
    default:
      console.error(`No json handler for source '${source.source}'`);
      return { scraped: 0, posted: 0, postFailed: 0, skipped: 1 };
  }
}
