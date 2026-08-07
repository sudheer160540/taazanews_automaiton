import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { SOURCES } from "./sources.js";
import type { NewsItem, ScrapeStats, SourceConfig } from "./framework/types.js";
import { createApiSink } from "./framework/api.js";
import { formatError } from "./framework/utils.js";
import { scrapeRss } from "./handlers/rss.js";
import { scrapeAutomate } from "./handlers/automate.js";
import { scrapeJson } from "./handlers/json.js";

const OUTPUT_FILE = process.env.OUTPUT_FILE ?? "output/news.json";
const API_URL =
  process.env.API_URL ?? "https://taajanews-api.onrender.com/api/source-articles";
const SKIP_API_POST = process.env.SKIP_API_POST === "1";
const WRITE_OUTPUT_FILE = process.env.WRITE_OUTPUT_FILE === "1";

const noopSink = async (_item: NewsItem): Promise<void> => {};

async function runOne(
  source: SourceConfig,
  onItem: (item: NewsItem) => Promise<void>
): Promise<ScrapeStats> {
  switch (source.type) {
    case "rss":
      return await scrapeRss(source, { onItem });
    case "automate":
      return await scrapeAutomate(source, { onItem });
    case "json":
      return await scrapeJson(source, { onItem });
    default:
      console.error(`Unsupported source type: ${String((source as SourceConfig).type)}`);
      return { scraped: 0, posted: 0, postFailed: 0, skipped: 1 };
  }
}

async function main(): Promise<void> {
  const totals: ScrapeStats = { scraped: 0, posted: 0, postFailed: 0, skipped: 0 };
  const apiCounters = { posted: 0, postFailed: 0 };
  const onItem = SKIP_API_POST ? noopSink : createApiSink(API_URL, apiCounters);

  for (const src of SOURCES) {
    console.error(`\n==> ${src.source} (${src.type}) ${src.url}`);
    try {
      const postedBefore = apiCounters.posted;
      const failedBefore = apiCounters.postFailed;
      const stats = await runOne(src, onItem);
      const posted = apiCounters.posted - postedBefore;
      const postFailed = apiCounters.postFailed - failedBefore;

      totals.scraped += stats.scraped;
      totals.skipped += stats.skipped;
      console.error(
        `[${src.source}] scraped ${stats.scraped}, posted ${posted}, api failed ${postFailed}`
      );
    } catch (err) {
      console.error(`Failed ${src.source}: ${formatError(err)}`);
      totals.skipped += 1;
    }
  }

  totals.posted = apiCounters.posted;
  totals.postFailed = apiCounters.postFailed;

  console.error(
    `\nDone — scraped ${totals.scraped}, posted ${totals.posted}, post failed ${totals.postFailed}`
  );

  if (WRITE_OUTPUT_FILE) {
    await mkdir(dirname(OUTPUT_FILE), { recursive: true });
    await writeFile(OUTPUT_FILE, JSON.stringify(totals, null, 2), "utf-8");
    console.error(`Wrote run summary to ${OUTPUT_FILE}`);
  }

  if (!SKIP_API_POST && totals.postFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(formatError(err));
  process.exit(1);
});
