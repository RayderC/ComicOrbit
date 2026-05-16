import * as cheerio from "cheerio";
import type {
  ChapterPayload,
  ChapterRef,
  ProgressFn,
  SearchResult,
  SeriesMetadata,
  Source,
} from "./types";

const BASE = "https://getcomics.org";
const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Priority order for file hosting — direct downloads ranked first
const PREFERRED_HOSTS = [
  /pixeldrain\.com/i,           // public API for direct download
  /getcomics\.(org|info)/i,     // their own CDN/redirect
  /dl\d*\./i,                   // generic CDN subdomains
  /mediafire\.com/i,
  /wetransfer\.com/i,
];
const UNSUPPORTED_HOSTS = /mega\.nz|mega\.io|terabox|4shared|zippyshare|rapidgator/i;

function parseIssueNumber(text: string): number {
  const m =
    text.match(/#\s*(\d+(?:\.\d+)?)/) ||
    text.match(/\bvol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i) ||
    text.match(/issue\s+(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 1;
}

// PixelDrain direct download: /u/{id} or /l/{id} → /api/file/{id}?download
async function downloadFromPixelDrain(url: string, signal?: AbortSignal): Promise<Buffer | null> {
  const m = url.match(/pixeldrain\.com\/(?:u|l)\/([A-Za-z0-9]+)/i);
  if (!m) return null;
  const fileId = m[1];
  const apiUrl = `https://pixeldrain.com/api/file/${fileId}?download`;
  try {
    const r = await fetch(apiUrl, { headers: UA, signal });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

export const getcomicsSource: Source = {
  id: "getcomics",
  type: "comic",

  async search(query: string): Promise<SearchResult[]> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`, { headers: UA });
    } catch (e) {
      console.warn("[getcomics] search fetch failed:", (e as Error).message);
      return [];
    }
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("article.type-post, article[class*='post']").each((_, el) => {
      const $el = $(el);
      const titleLink = $el.find("h1 a, h2 a, h3 a, .post-title a").first();
      const title = titleLink.text().trim();
      const url = titleLink.attr("href") || "";
      if (!title || !url) return;

      const imgEl = $el.find("img").first();
      const cover =
        imgEl.attr("src") ||
        imgEl.attr("data-src") ||
        imgEl.attr("data-lazy-src") ||
        undefined;

      const excerpt = $el.find(".entry-summary p, .entry-content p").first().text().trim().slice(0, 280);
      const tags = $el.find(".cat-links a, .post-categories a").map((__, a) => $(a).text().trim()).get().filter(Boolean);

      results.push({ source: "getcomics", type: "comic", title, url, cover, description: excerpt, status: "unknown", tags });
    });

    return results;
  },

  async getMetadata(url: string): Promise<SeriesMetadata> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`GetComics metadata failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $("h1.post-title, h1.entry-title").first().text().trim() ||
      $("title").text().split(/[-|]/)[0].trim();

    const description = $(".post-contents p, .entry-content p")
      .map((_, p) => $(p).text().trim())
      .get()
      .filter((t) => t && !/^(download|read online)/i.test(t))
      .join("\n\n")
      .slice(0, 1500);

    const cover =
      $(".wp-post-image, .post-thumbnail img").first().attr("src") ||
      $("article img").first().attr("src") || "";

    const tags = $(".post-categories a, .post-tags a, .cat-links a")
      .map((_, a) => $(a).text().trim()).get().filter(Boolean);

    return { title, description, cover: cover || undefined, status: "unknown", tags, oneShot: true };
  },

  async listChapters(url: string): Promise<ChapterRef[]> {
    const slug = url.split("/").filter(Boolean).pop() || "";
    return [{ externalId: url, number: parseIssueNumber(slug.replace(/-/g, " ")), title: "Issue" }];
  },

  async fetchChapter(ref: ChapterRef, onProgress: ProgressFn, signal?: AbortSignal): Promise<ChapterPayload> {
    const postRes = await fetch(ref.externalId, { headers: { ...UA, Referer: BASE }, signal });
    if (!postRes.ok) throw new Error(`GetComics post failed: ${postRes.status}`);
    const html = await postRes.text();
    const $ = cheerio.load(html);

    // ── Collect all links on the page ──
    const allLinks: Array<{ url: string; text: string }> = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (href && href !== "#" && !href.startsWith("javascript")) {
        allLinks.push({ url: href, text });
      }
    });

    // ── Score and sort links by likelihood of being the file ──
    interface Candidate { url: string; score: number; text: string; }
    const candidates: Candidate[] = [];

    for (const { url, text } of allLinks) {
      let score = 0;

      // Direct archive extension = best
      if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(url)) score += 100;

      // PixelDrain = easy public API
      if (/pixeldrain\.com\/(u|l)\//i.test(url)) score += 80;

      // GetComics own redirect/CDN
      if (/getcomics\.(org|info)\/(go|get|dls?)\//i.test(url)) score += 70;

      // Generic CDN-like domains
      if (/dl\d*\.[a-z]+\.(com|net|org)/i.test(url)) score += 40;

      // Download-like link text
      if (/\b(main server|download now|direct|get file)\b/i.test(text)) score += 30;
      if (/\bdownload\b/i.test(text)) score += 15;
      if (/\bmirror\b/i.test(text)) score += 10;

      // Deprioritise known-unsupported hosts
      if (UNSUPPORTED_HOSTS.test(url)) score = Math.max(score - 200, -1);

      if (score > 0) candidates.push({ url, score, text });
    }

    // Deduplicate URLs, keep highest score
    const seen = new Map<string, Candidate>();
    for (const c of candidates) {
      const existing = seen.get(c.url);
      if (!existing || existing.score < c.score) seen.set(c.url, c);
    }
    const ranked = Array.from(seen.values()).sort((a, b) => b.score - a.score);

    console.log(`[getcomics] ${ranked.length} candidate links for ${ref.externalId}`);
    for (const c of ranked.slice(0, 5)) {
      console.log(`  score=${c.score} text="${c.text}" url=${c.url}`);
    }

    if (ranked.length === 0) {
      throw new Error(`No download links found on page: ${ref.externalId}`);
    }

    let lastUnsupportedHost: string | null = null;

    for (const { url: candidateUrl } of ranked) {
      // ── PixelDrain: use their download API directly ──
      if (/pixeldrain\.com\/(u|l)\//i.test(candidateUrl)) {
        const buf = await downloadFromPixelDrain(candidateUrl, signal);
        if (buf) {
          onProgress(1, 1);
          return { kind: "archive", data: buf, ext: "cbz" };
        }
        continue;
      }

      // ── Known unsupported hosts ──
      if (UNSUPPORTED_HOSTS.test(candidateUrl)) {
        try { lastUnsupportedHost = new URL(candidateUrl).hostname; } catch { /* ignore */ }
        continue;
      }

      // ── Try to resolve to a direct file through redirects ──
      const resolved = await resolveToDirectFile(candidateUrl, BASE, signal);
      if (!resolved) continue;

      if (resolved.unsupported) { lastUnsupportedHost = resolved.unsupported; continue; }
      if (!resolved.fileUrl) continue;

      try {
        onProgress(0, 1);
        const fileRes = await fetch(resolved.fileUrl, { headers: { ...UA, Referer: BASE }, signal });
        if (!fileRes.ok) continue;
        const buf = Buffer.from(await fileRes.arrayBuffer());
        onProgress(1, 1);
        const extMatch = resolved.fileUrl.match(/\.(cbz|cbr|zip|rar)(?:\?|$)/i);
        const ext = (extMatch?.[1].toLowerCase() || "cbz") as "cbz" | "cbr" | "zip";
        return { kind: "archive", data: buf, ext };
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") throw e;
        console.warn("[getcomics] download attempt failed:", (e as Error).message);
      }
    }

    if (lastUnsupportedHost) {
      return { kind: "unsupported_host", host: lastUnsupportedHost, url: ref.externalId };
    }
    throw new Error(`Could not download any file from: ${ref.externalId}`);
  },
};

// ── Resolve a URL to a direct downloadable file, following redirects ──
interface ResolveResult { fileUrl?: string; unsupported?: string; }

async function resolveToDirectFile(
  startUrl: string,
  referer: string,
  signal?: AbortSignal,
  hops = 0,
): Promise<ResolveResult | null> {
  if (hops > 6) return null;

  if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(startUrl)) return { fileUrl: startUrl };
  if (UNSUPPORTED_HOSTS.test(startUrl)) {
    try { return { unsupported: new URL(startUrl).hostname }; } catch { return null; }
  }

  // PixelDrain handled separately above
  if (/pixeldrain\.com/i.test(startUrl)) return null;

  try {
    const res = await fetch(startUrl, {
      headers: { ...UA, Referer: referer },
      redirect: "follow",
      signal,
    });
    const finalUrl = res.url;

    // HTTP redirect landed on a file
    if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(finalUrl)) return { fileUrl: finalUrl };

    // Content-Type indicates binary file
    const ct = res.headers.get("content-type") || "";
    if (
      ct.startsWith("application/octet-stream") ||
      ct.startsWith("application/zip") ||
      ct.startsWith("application/x-cbz") ||
      ct.startsWith("application/x-rar") ||
      (ct.startsWith("application/") && !ct.includes("html") && !ct.includes("json") && !ct.includes("xml"))
    ) {
      return { fileUrl: finalUrl };
    }

    if (!res.ok) return null;

    const body = await res.text();
    const $ = cheerio.load(body);

    // Direct archive link anywhere in page
    let foundFile = "";
    $("a[href]").each((_, el) => {
      const h = $(el).attr("href") || "";
      if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(h)) { foundFile = h; return false; }
    });
    if (foundFile) return { fileUrl: foundFile };

    // meta-refresh
    const meta = $('meta[http-equiv="refresh"]').attr("content") || "";
    const mRef = meta.match(/url=(.+)/i);
    if (mRef) {
      const next = mRef[1].trim().replace(/['"]/g, "");
      return resolveToDirectFile(next, finalUrl, signal, hops + 1);
    }

    // "Click here" / "Download" link to follow
    let nextHop = "";
    $("a[href]").each((_, el) => {
      const h = $(el).attr("href") || "";
      const t = $(el).text().trim().toLowerCase();
      if (h && h !== "#" && /\b(click here|download|get file|direct link|proceed|continue)\b/i.test(t)) {
        nextHop = h; return false;
      }
    });
    if (nextHop) return resolveToDirectFile(nextHop, finalUrl, signal, hops + 1);
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw e;
  }

  return null;
}
