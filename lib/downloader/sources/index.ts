import { mangadexSource } from "./mangadex";
import { mangafreakSource } from "./mangafreak";
import { getcomicsSource } from "./getcomics";
import type { Source, SearchResult } from "./types";

export const SOURCES: Record<string, Source> = {
  mangadex: mangadexSource,
  mangafreak: mangafreakSource,
  getcomics: getcomicsSource,
};

export const MANGA_SOURCES = ["mangafreak", "mangadex"] as const;
export const COMIC_SOURCES = ["getcomics"] as const;

export function getSource(id: string): Source {
  const s = SOURCES[id];
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

// Run search across multiple sources in parallel, return combined results.
// Sources that throw or time out are silently skipped.
export async function multiSearch(sourceIds: string[], query: string): Promise<SearchResult[]> {
  const all = await Promise.allSettled(
    sourceIds.map((id) => withTimeout(SOURCES[id]?.search(query) ?? Promise.resolve([]), 15000))
  );
  const results: SearchResult[] = [];
  for (const r of all) {
    if (r.status === "fulfilled") results.push(...r.value);
  }
  return results;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
