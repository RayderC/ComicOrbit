import * as cheerio from "cheerio";
import pLimit from "p-limit";
import type {
  ChapterPayload,
  ChapterRef,
  ProgressFn,
  SearchResult,
  SeriesMetadata,
  Source,
} from "./types";

const BASE = "https://ww1.mangafreak.me";
const UA = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

function absUrl(href: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${BASE}${href}`;
  return `${BASE}/${href}`;
}

function slugFromUrl(url: string): string {
  const last = url.split("/").filter(Boolean).pop() || "";
  return last.toLowerCase();
}

function isPageImage(src: string): boolean {
  if (!src) return false;
  if (!src.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) return false;
  if (src.match(/\/(logo|icon|banner|avatar|ads?|sprite|thumb_default)/i)) return false;
  return true;
}

export const mangafreakSource: Source = {
  id: "mangafreak",
  type: "manga",

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetch(`${BASE}/Find/${encodeURIComponent(query)}`, { headers: UA });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    $(".manga_search_item").each((_, el) => {
      const $el = $(el);
      const link = $el.find("h3 a").first();
      const title = link.text().trim();
      const href = absUrl(link.attr("href") || "");
      if (!title || !href) return;
      const img = $el.find("img").first().attr("src") || "";
      const cover = img ? absUrl(img) : undefined;
      const meta = $el.find("div").map((__, d) => $(d).text().trim()).get().join(" • ");
      const tags = $el.find("a").map((__, a) => $(a).text().trim()).get()
        .filter((t) => t && t !== title);

      results.push({
        source: "mangafreak",
        type: "manga",
        title,
        url: href,
        cover,
        description: "",
        status: "unknown",
        tags,
        chapters_hint: meta,
      });
    });
    return results;
  },

  async getMetadata(url: string): Promise<SeriesMetadata> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`MangaFreak metadata failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $(".manga_series_data h1, .manga_series_data h5").first().text().trim()
      || $("title").text().split("|")[0].trim();
    const description = $(".manga_series_description p").first().text().trim();
    const cover = absUrl($(".manga_series_image img").first().attr("src") || "");
    const statusText = $(".manga_series_data").text().toLowerCase();
    const status: SeriesMetadata["status"] = statusText.includes("complete")
      ? "completed"
      : statusText.includes("ongoing")
      ? "ongoing"
      : "unknown";
    const tags = $(".series_sub_genre_list a, .series_genre a").map((_, a) => $(a).text().trim()).get();

    return {
      title,
      description,
      cover: cover || undefined,
      status,
      tags,
      oneShot: false,
    };
  },

  async listChapters(url: string): Promise<ChapterRef[]> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`MangaFreak list failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const out: ChapterRef[] = [];
    $(".manga_series_list a, .chapter_list a").each((_, a) => {
      const href = absUrl($(a).attr("href") || "");
      if (!href) return;
      const text = $(a).text().trim();
      const m = text.match(/(\d+(?:\.\d+)?)/);
      const num = m ? parseFloat(m[1]) : NaN;
      if (!Number.isFinite(num)) return;
      out.push({ externalId: href, number: num, title: text });
    });

    // Dedup by chapter number, take first.
    const seen = new Set<number>();
    const unique = out.filter((c) => {
      if (seen.has(c.number)) return false;
      seen.add(c.number);
      return true;
    });
    unique.sort((a, b) => a.number - b.number);
    return unique;
  },

  async fetchChapter(ref: ChapterRef, onProgress: ProgressFn, signal): Promise<ChapterPayload> {
    let urls: string[] = [];

    // Strategy 1: scrape the chapter page for embedded image URLs (most reliable)
    try {
      const pageRes = await fetch(ref.externalId, { headers: UA, signal });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const $ = cheerio.load(html);

        $("img").each((_, el) => {
          const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy") || "";
          if (isPageImage(src) && !urls.includes(absUrl(src))) {
            urls.push(absUrl(src));
          }
        });

        // Also mine script tags for JSON image arrays
        if (urls.length < 2) {
          const scriptText = $("script").map((_, el) => $(el).html() || "").get().join("\n");
          const found = [...scriptText.matchAll(/["'`](https?:\/\/[^"'`\s]+\.(?:jpg|jpeg|png|webp))["'`]/gi)]
            .map((m) => m[1])
            .filter(isPageImage);
          for (const u of found) {
            if (!urls.includes(u)) urls.push(u);
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") throw e;
      console.warn(`[mangafreak] chapter page scrape failed for ${ref.externalId}:`, (e as Error).message);
    }

    // Strategy 2: probe images.mangafreak.me with HEAD until 404
    if (urls.length === 0) {
      const slug = slugFromUrl(ref.externalId.replace(/_\d+(\.\d+)?\/?$/, "").replace(/\/$/, ""));
      const ch = ref.number % 1 === 0 ? String(Math.floor(ref.number)) : String(ref.number);
      console.log(`[mangafreak] scrape yielded no images, probing for ${slug} ch${ch}`);
      for (let n = 1; n <= 200; n++) {
        const u = `https://images.mangafreak.me/mangas/${slug}/${slug}_${ch}/${slug}_${ch}_${n}.jpg`;
        try {
          const head = await fetch(u, { method: "HEAD", headers: UA, signal });
          if (!head.ok) break;
          const ct = head.headers.get("content-type") || "";
          if (!ct.startsWith("image/")) break;
          urls.push(u);
        } catch {
          break;
        }
      }
    }

    if (urls.length === 0) {
      throw new Error(`No pages found for chapter ${ref.number} — tried scraping ${ref.externalId}`);
    }

    const buffers: Buffer[] = new Array(urls.length);
    const limit = pLimit(5);
    let done = 0;
    await Promise.all(urls.map((u, i) => limit(async () => {
      const r = await fetchWithRetry(u, signal);
      buffers[i] = Buffer.from(await r.arrayBuffer());
      done++;
      onProgress(done, urls.length);
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
