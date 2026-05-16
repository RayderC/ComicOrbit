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

function getImageDimensions(buf: Buffer): { w: number; h: number } | null {
  try {
    // PNG: 8-byte signature, then IHDR — width at bytes 16-19, height 20-23
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // JPEG: scan for SOF markers (C0/C1/C2/C9/CA/CB)
    if (buf.length > 10 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 8 < buf.length) {
        if (buf[i] !== 0xff) break;
        const m = buf[i + 1];
        const segLen = buf.readUInt16BE(i + 2);
        if (m === 0xc0 || m === 0xc1 || m === 0xc2 || m === 0xc9 || m === 0xca || m === 0xcb) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + segLen;
      }
    }
  } catch { /* ignore malformed headers */ }
  return null;
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
    // MangaFreak may put status in several places — search broadly
    const statusText = $(
      ".manga_series_data, .manga-status, .status, .detail-info, .manga_detail, .summary_content"
    ).text().toLowerCase() || $("body").text().toLowerCase();
    const status: SeriesMetadata["status"] =
      statusText.includes("complete") || statusText.includes("finished") || statusText.includes("ended")
        ? "completed"
        : statusText.includes("ongoing") || statusText.includes("on-going") ||
          statusText.includes("publishing") || statusText.includes("releasing")
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
    // officialPageCount comes from MangaFreak's own page-selector dropdown.
    // It reflects only real manga pages — promotional images beyond this count are excluded.
    let officialPageCount = 0;

    // Strategy 1: scrape the chapter page
    try {
      const pageRes = await fetch(ref.externalId, { headers: UA, signal });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const $ = cheerio.load(html);

        // Extract the official page count from the page-navigation <select>.
        // MangaFreak renders <select><option value="1">1</option>…<option value="N">N</option></select>
        // where N is the real chapter length (no promotional pages included).
        const pageNums = $("select option")
          .map((_, el) => parseInt($(el).attr("value") || "0", 10))
          .get()
          .filter((n) => Number.isFinite(n) && n > 0);
        if (pageNums.length > 1) officialPageCount = Math.max(...pageNums);

        // Also check data-total, data-pages, or any explicit count attribute
        if (!officialPageCount) {
          const dataTotal = $("[data-total], [data-pages], [data-pagecount]")
            .first()
            .attr("data-total") ??
            $("[data-total], [data-pages], [data-pagecount]").first().attr("data-pages") ??
            $("[data-total], [data-pages], [data-pagecount]").first().attr("data-pagecount");
          const parsed = parseInt(dataTotal || "0", 10);
          if (parsed > 0) officialPageCount = parsed;
        }

        // #arraydata: pipe-separated list of image URLs MangaFreak embeds in the page
        const arrayData = $("#arraydata").text().trim();
        if (arrayData) {
          const allSrcs = arrayData.split("|").map((s) => s.trim()).filter(isPageImage);
          // Limit to officialPageCount if known; the remainder are promotional images
          const cap = officialPageCount > 0 ? officialPageCount : allSrcs.length;
          allSrcs.slice(0, cap).forEach((src) => {
            const abs = absUrl(src);
            if (!urls.includes(abs)) urls.push(abs);
          });
        }

        // img tags — prefer specific chapter-image classes MangaFreak uses
        if (urls.length === 0) {
          const imgSels = "img.img-loading, img[id^='id_'], img[data-index], .chapter-images img, .chapter_images img";
          const specificImgs: string[] = [];
          $(imgSels).each((_, el) => {
            const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy") || "";
            if (isPageImage(src)) specificImgs.push(absUrl(src));
          });
          // Fallback: all img tags
          if (specificImgs.length === 0) {
            $("img").each((_, el) => {
              const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy") || "";
              if (isPageImage(src)) specificImgs.push(absUrl(src));
            });
          }
          const cap = officialPageCount > 0 ? officialPageCount : specificImgs.length;
          specificImgs.slice(0, cap).forEach((u) => { if (!urls.includes(u)) urls.push(u); });
        }

        // Script-tag image arrays
        if (urls.length < 2) {
          const scriptText = $("script").map((_, el) => $(el).html() || "").get().join("\n");
          const found = [...scriptText.matchAll(/["'`](https?:\/\/[^"'`\s]+\.(?:jpg|jpeg|png|webp))["'`]/gi)]
            .map((m) => m[1])
            .filter(isPageImage);
          const cap = officialPageCount > 0 ? officialPageCount : found.length;
          found.slice(0, cap).forEach((u) => { if (!urls.includes(u)) urls.push(u); });
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") throw e;
      console.warn(`[mangafreak] chapter page scrape failed for ${ref.externalId}:`, (e as Error).message);
    }

    // Strategy 2: probe images.mangafreak.me with HEAD
    // Chapter URLs like /Read1_Series_Name_3 — strip the "Read{n}_" prefix for the CDN slug.
    // If we have an official count, stop there so promotional pages are never probed.
    if (urls.length === 0) {
      const chapterSeg = slugFromUrl(ref.externalId.replace(/\/$/, ""));
      const seriesSlug = chapterSeg.replace(/^read\d+_/, "").replace(/_\d+(\.\d+)?$/, "");
      const ch = ref.number % 1 === 0 ? String(Math.floor(ref.number)) : String(ref.number);
      const maxProbe = officialPageCount > 0 ? officialPageCount : 200;
      console.log(`[mangafreak] probing ${seriesSlug} ch${ch} (max ${maxProbe})`);
      for (let n = 1; n <= maxProbe; n++) {
        const u = `https://images.mangafreak.me/mangas/${seriesSlug}/${seriesSlug}_${ch}/${seriesSlug}_${ch}_${n}.jpg`;
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
      throw new Error(`No pages found for chapter ${ref.number} — URL: ${ref.externalId}`);
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

    // Final safety: drop any trailing landscape images (promotional banners).
    // Real manga pages are always portrait (h ≥ w).
    const filtered = [...buffers];
    for (let i = 0; i < 5 && filtered.length > 1; i++) {
      const dims = getImageDimensions(filtered[filtered.length - 1]);
      if (dims && dims.w > dims.h) filtered.pop();
      else break;
    }

    return { kind: "images", images: filtered };
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
