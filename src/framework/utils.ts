export function uniq<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function safeString(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const s = x.trim();
  return s.length ? s : undefined;
}

