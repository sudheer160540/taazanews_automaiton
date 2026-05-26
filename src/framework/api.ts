import type { NewsItem } from "./types.js";
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

export function toApiPayload(item: NewsItem): SourceArticlePayload {
  const sourceId = extractSourceId(item.source, item.url);
  const contentText =
    item.contentText ?? item.summary ?? undefined;

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

export async function postSourceArticles(
  items: NewsItem[],
  apiUrl: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const payloads = items
    .filter((x) => !x.error && x.url)
    .map(toApiPayload);

  if (payloads.length === 0) {
    return { ok: true, status: 204, body: "No articles to post (all had errors or empty)." };
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payloads),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
