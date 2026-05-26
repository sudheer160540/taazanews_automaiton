import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { SOURCES } from "./sources.js";
import type { NewsItem, SourceConfig } from "./framework/types.js";
import { postSourceArticles, toApiPayload } from "./framework/api.js";
import { scrapeRss } from "./handlers/rss.js";
import { scrapeAutomate } from "./handlers/automate.js";

const OUTPUT_FILE = process.env.OUTPUT_FILE ?? "output/news.json";
const API_URL =
  process.env.API_URL ?? "http://localhost:5001/api/source-articles";
const SKIP_API_POST = process.env.SKIP_API_POST === "1";

async function runOne(source: SourceConfig): Promise<NewsItem[]> {
  switch (source.type) {
    case "rss":
      return await scrapeRss(source);
    case "automate":
      return await scrapeAutomate(source);
    default: {
      const s = source as unknown as { source?: string; type?: string; url?: string };
      return [
        {
          source: s.source ?? "unknown",
          type: (s.type as any) ?? "rss",
          url: s.url ?? "",
          error: `Unsupported source type: ${String(s.type)}`,
        },
      ];
    }
  }
}

async function main(): Promise<void> {
  const all: NewsItem[] = [];
  for (const src of SOURCES) {
    console.error(`\n==> ${src.source} (${src.type}) ${src.url}`);
    try {
      const items = await runOne(src);
      all.push(...items);
      console.error(`Collected ${items.length} items from ${src.source}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      all.push({
        source: src.source,
        type: src.type,
        url: src.url,
        error: message,
      });
      console.error(`Failed ${src.source}: ${message}`);
    }
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  const forOutput = all.map(toApiPayload);
  await writeFile(OUTPUT_FILE, JSON.stringify(forOutput, null, 2), "utf-8");
  console.error(`\nWrote ${all.length} items to ${OUTPUT_FILE}`);

  if (!SKIP_API_POST) {
    console.error(`\nPosting to ${API_URL} ...`);
    const { ok, status, body } = await postSourceArticles(all, API_URL);
    if (ok) {
      console.error(`API POST OK (${status}): ${body.slice(0, 500)}`);
    } else {
      console.error(`API POST failed (${status}): ${body.slice(0, 500)}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

