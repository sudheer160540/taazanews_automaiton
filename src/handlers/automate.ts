import type { AutomateSourceConfig, NewsItem } from "../framework/types.js";
import { scrapeEenaduAutomate } from "./eenaduAutomate.js";

export async function scrapeAutomate(source: AutomateSourceConfig): Promise<NewsItem[]> {
  switch (source.source) {
    case "eenadu":
      return await scrapeEenaduAutomate(source);
    default:
      return [
        {
          source: source.source,
          type: source.type,
          url: source.url,
          error: `No automate handler registered for source '${source.source}'`,
        },
      ];
  }
}

