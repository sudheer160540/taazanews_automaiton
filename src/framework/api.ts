import type { ArticleSink, NewsItem } from "./types.js";
import { extractSourceId } from "./sourceId.js";

export interface SourceArticlePayload {
  source: string;
  type: string;
  url: string;
  sourceId?: string;
  title?: string;
  publishedAt?: string;
  contentText?: string;
  error?: string;
}

export interface PostResult {
  ok: boolean;
  status: number;
  body: string;
}

export function toApiPayload(item: NewsItem): SourceArticlePayload {
  const sourceId = extractSourceId(item.source, item.url);
  // Prefer full article body; only fall back to list excerpt when body is missing.
  const contentText = item.contentText?.trim() || item.summary?.trim() || undefined;

  return {
    source: item.source,
    type: item.type,
    url: item.url,
    ...(sourceId ? { sourceId } : {}),
    ...(item.title ? { title: item.title } : {}),
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    ...(contentText ? { contentText } : {}),
    ...(item.error ? { error: item.error } : {}),
  };
}

/** POST a single article (API expects an array with one item). */
export async function postSourceArticle(
  item: NewsItem,
  apiUrl: string
): Promise<PostResult> {
  if (item.error || !item.url) {
    return { ok: false, status: 0, body: "Skipped: item has error or no url" };
  }

  const payload = toApiPayload(item);
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify([payload]),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** Sink that POSTs each item to the API as soon as it is scraped. */
export function createApiSink(
  apiUrl: string,
  counters?: { posted: number; postFailed: number }
): ArticleSink {
  return async (item: NewsItem) => {
    if (item.error || !item.url) return;

    const sourceId = extractSourceId(item.source, item.url);
    const label = sourceId ?? item.url.slice(-40);
    const { ok, status, body } = await postSourceArticle(item, apiUrl);

    const contentLen = item.contentText?.length ?? 0;
    if (contentLen < 100) {
      console.error(
        `[api] warn ${item.source} ${label}: short/missing contentText (${contentLen} chars)`
      );
    }
    if (ok) {
      counters && (counters.posted += 1);
      console.error(
        `[api] saved ${item.source} ${label} (${status}) contentText=${contentLen} chars`
      );
    } else {
      counters && (counters.postFailed += 1);
      console.error(`[api] failed ${item.source} ${label} (${status}): ${body.slice(0, 200)}`);
    }
  };
}
