import pLimit from "p-limit";
import type {
  ChapterPayload,
  SearchResult,
  SeriesMetadata,
  Source,
  ChapterRef,
} from "./types";

const API = "https://api.mangadex.org";
const UPLOADS = "https://uploads.mangadex.org";
const UA = { "User-Agent": "ComicOrbit/0.2 (+https://github.com/rayderc/comicorbit)" };

type MdRel = { id: string; type: string; attributes?: Record<string, unknown> };
type MdManga = {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    tags: { attributes: { name: Record<string, string> } }[];
  };
  relationships: MdRel[];
};
type MdChapter = {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    pages: number;
    externalUrl: string | null;
  };
};

function en(r: Record<string, string> | undefined): string {
  if (!r) return "";
  return r.en || r["en-us"] || Object.values(r)[0] || "";
}

function statusOf(s: string): SeriesMetadata["status"] {
  if (s === "ongoing") return "ongoing";
  if (s === "completed") return "completed";
  if (s === "hiatus") return "hiatus";
  return "unknown";
}

function mangaIdFromUrl(url: string): string {
  // Accept either a full mangadex.org URL or a raw UUID.
  const m = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) throw new Error("Invalid MangaDex URL/id");
  return m[0];
}

export const mangadexSource: Source = {
  id: "mangadex",
  type: "manga",

  async search(query: string): Promise<SearchResult[]> {
    const u = new URL(`${API}/manga`);
    u.searchParams.set("title", query);
    u.searchParams.set("limit", "20");
    u.searchParams.append("includes[]", "cover_art");
    u.searchParams.append("contentRating[]", "safe");
    u.searchParams.append("contentRating[]", "suggestive");
    u.searchParams.append("contentRating[]", "erotica");
    const res = await fetch(u, { headers: UA });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: MdManga[] };
    return (json.data || []).map((m) => {
      const coverRel = m.relationships.find((r) => r.type === "cover_art");
      const coverFile = coverRel?.attributes?.fileName as string | undefined;
      const cover = coverFile ? `${UPLOADS}/covers/${m.id}/${coverFile}.256.jpg` : undefined;
      return {
        source: "mangadex",
        type: "manga",
        title: en(m.attributes.title),
        url: `https://mangadex.org/title/${m.id}`,
        cover,
        description: en(m.attributes.description),
        status: statusOf(m.attributes.status),
        tags: m.attributes.tags.map((t) => en(t.attributes.name)).filter(Boolean),
      } as SearchResult;
    });
  },

  async getMetadata(url: string): Promise<SeriesMetadata> {
    const id = mangaIdFromUrl(url);
    const u = new URL(`${API}/manga/${id}`);
    u.searchParams.append("includes[]", "cover_art");
    const res = await fetch(u, { headers: UA });
    if (!res.ok) throw new Error(`MangaDex metadata failed: ${res.status}`);
    const json = (await res.json()) as { data: MdManga };
    const m = json.data;
    const coverRel = m.relationships.find((r) => r.type === "cover_art");
    const coverFile = coverRel?.attributes?.fileName as string | undefined;
    return {
      title: en(m.attributes.title),
      description: en(m.attributes.description),
      cover: coverFile ? `${UPLOADS}/covers/${m.id}/${coverFile}.512.jpg` : undefined,
      status: statusOf(m.attributes.status),
      tags: m.attributes.tags.map((t) => en(t.attributes.name)).filter(Boolean),
      oneShot: false,
    };
  },

  async listChapters(url: string): Promise<ChapterRef[]> {
    const id = mangaIdFromUrl(url);
    const out: ChapterRef[] = [];
    const seen = new Set<string>();
    const limit = 100;
    for (let offset = 0; offset < 5000; offset += limit) {
      const u = new URL(`${API}/manga/${id}/feed`);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("offset", String(offset));
      u.searchParams.append("translatedLanguage[]", "en");
      u.searchParams.append("order[chapter]", "asc");
      u.searchParams.append("contentRating[]", "safe");
      u.searchParams.append("contentRating[]", "suggestive");
      u.searchParams.append("contentRating[]", "erotica");
      const res = await fetch(u, { headers: UA });
      if (!res.ok) break;
      const json = (await res.json()) as { data: MdChapter[]; total: number };
      for (const c of json.data) {
        if (!c.attributes.chapter || c.attributes.externalUrl) continue;
        const numStr = c.attributes.chapter;
        const num = parseFloat(numStr);
        if (!Number.isFinite(num)) continue;
        // Dedup: only keep first ch.X we encounter.
        if (seen.has(numStr)) continue;
        seen.add(numStr);
        out.push({
          externalId: c.id,
          number: num,
          title: c.attributes.title || `Chapter ${numStr}`,
        });
      }
      if (json.data.length < limit) break;
    }
    out.sort((a, b) => a.number - b.number);
    return out;
  },

  async fetchChapter(ref, onProgress, signal): Promise<ChapterPayload> {
    const res = await fetch(`${API}/at-home/server/${ref.externalId}`, { headers: UA, signal });
    if (!res.ok) throw new Error(`MangaDex at-home failed: ${res.status}`);
    const json = (await res.json()) as { baseUrl: string; chapter: { hash: string; data: string[] } };
    const urls = json.chapter.data.map((f) => `${json.baseUrl}/data/${json.chapter.hash}/${f}`);

    const total = urls.length;
    const buffers: Buffer[] = new Array(total);
    let done = 0;
    const limit = pLimit(5);

    await Promise.all(urls.map((u, i) => limit(async () => {
      const r = await fetchWithRetry(u, signal);
      buffers[i] = Buffer.from(await r.arrayBuffer());
      done++;
      onProgress(done, total);
    })));

    return { kind: "images", images: buffers };
  },
};

async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal });
      if (r.ok) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") throw e;
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 500 * Math.pow(2, i)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}
