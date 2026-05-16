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

function parseIssueNumber(title: string): number {
  const m =
    title.match(/#\s*(\d+(?:\.\d+)?)/) ||
    title.match(/\bvol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i) ||
    title.match(/issue\s+(\d+(?:\.\d+)?)/i) ||
    title.match(/\b(\d{4})\b/); // year as fallback
  return m ? parseFloat(m[1]) : 1;
}

export const getcomicsSource: Source = {
  id: "getcomics",
  type: "comic",

  async search(query: string): Promise<SearchResult[]> {
    const url = `${BASE}/?s=${encodeURIComponent(query)}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: UA });
    } catch (e) {
      console.warn("[getcomics] search fetch failed:", (e as Error).message);
      return [];
    }
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // Primary selector used by current GetComics layout
    const articles = $("article.type-post, article[class*='post']");
    articles.each((_, el) => {
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
        imgEl.attr("data-original") ||
        undefined;

      const excerpt = $el
        .find(".post-info p, .entry-summary p, .entry-content p")
        .first()
        .text()
        .trim()
        .slice(0, 280);

      const tags = $el
        .find(".cat-links a, .post-categories a, .post-tags a")
        .map((__, a) => $(a).text().trim())
        .get()
        .filter(Boolean);

      results.push({
        source: "getcomics",
        type: "comic",
        title,
        url,
        cover,
        description: excerpt,
        status: "unknown",
        tags,
      });
    });

    return results;
  },

  async getMetadata(url: string): Promise<SeriesMetadata> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`GetComics metadata failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $("h1.post-title, h1.entry-title, .post-title h1").first().text().trim() ||
      $("title").text().split(/[-|]/)[0].trim();

    const description = $(".post-contents p, .entry-content p")
      .map((_, p) => $(p).text().trim())
      .get()
      .filter((t) => t && !/^(download|read online)/i.test(t))
      .join("\n\n")
      .slice(0, 1500);

    const cover =
      $(".wp-post-image, .post-thumbnail img, article img").first().attr("src") ||
      $("article img").first().attr("src") ||
      "";

    const tags = $(".post-categories a, .post-tags a, .cat-links a")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    return {
      title,
      description,
      cover: cover || undefined,
      status: "unknown",
      tags,
      oneShot: true,
    };
  },

  async listChapters(url: string): Promise<ChapterRef[]> {
    // GetComics posts are single-issue downloads. Model as one chapter per post.
    const slug = url.split("/").filter(Boolean).pop() || "";
    return [{
      externalId: url,
      number: parseIssueNumber(slug.replace(/-/g, " ")),
      title: "Issue",
    }];
  },

  async fetchChapter(ref: ChapterRef, onProgress: ProgressFn, signal?: AbortSignal): Promise<ChapterPayload> {
    // ── Step 1: Fetch the post page ──
    const postRes = await fetch(ref.externalId, {
      headers: { ...UA, Referer: BASE },
      signal,
    });
    if (!postRes.ok) throw new Error(`GetComics post page failed: ${postRes.status}`);
    const html = await postRes.text();
    const $ = cheerio.load(html);

    // ── Step 2: Collect candidate download links ──
    const candidates: Array<{ url: string; priority: number }> = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      if (!href || href === "#" || href.startsWith("javascript")) return;

      // Direct archive links (highest priority)
      if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(href)) {
        candidates.push({ url: href, priority: 10 });
        return;
      }
      // GetComics own redirect / go links
      if (/getcomics\.(org|info)\/(go|get)\//i.test(href)) {
        const boost = /main server|direct/i.test(text) ? 2 : 1;
        candidates.push({ url: href, priority: 8 + boost });
        return;
      }
      // Download-like link text — exclude known unsupported hosts
      if (/\b(download|main server|direct download|get .{0,10}file)\b/i.test(text)) {
        if (!/mega\.nz|drive\.google|mediafire|zippyshare|4shared|sendspace/i.test(href)) {
          candidates.push({ url: href, priority: 5 });
        }
      }
    });

    // Also scan data attributes (some themes use them)
    $("[data-link], [data-href], [data-url]").each((_, el) => {
      const href =
        $(el).attr("data-link") ||
        $(el).attr("data-href") ||
        $(el).attr("data-url") ||
        "";
      if (href && !candidates.some((c) => c.url === href)) {
        candidates.push({ url: href, priority: 4 });
      }
    });

    // Sort highest priority first
    candidates.sort((a, b) => b.priority - a.priority);

    if (candidates.length === 0) {
      throw new Error(`No download links found on page: ${ref.externalId}`);
    }

    // ── Step 3: Try each candidate ──
    let lastUnsupportedHost: string | null = null;

    for (const { url } of candidates) {
      // Skip known unsupported hosts immediately
      if (/mega\.nz|drive\.google|mediafire|zippyshare/i.test(url)) {
        try { lastUnsupportedHost = new URL(url).hostname; } catch { /* ignore */ }
        continue;
      }

      const resolved = await resolveToDirectFile(url, BASE, signal);
      if (!resolved) continue;

      if (resolved.unsupported) {
        lastUnsupportedHost = resolved.unsupported;
        continue;
      }
      if (!resolved.fileUrl) continue;

      // ── Step 4: Download the file ──
      try {
        onProgress(0, 1);
        const fileRes = await fetch(resolved.fileUrl, {
          headers: { ...UA, Referer: BASE },
          signal,
        });
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

    // All candidates failed or were unsupported
    if (lastUnsupportedHost) {
      return { kind: "unsupported_host", host: lastUnsupportedHost, url: ref.externalId };
    }
    throw new Error(`Could not download any file from: ${ref.externalId}`);
  },
};

// ── Helpers ──

interface ResolveResult {
  fileUrl?: string;
  unsupported?: string;
}

async function resolveToDirectFile(
  startUrl: string,
  referer: string,
  signal?: AbortSignal,
  hops = 0
): Promise<ResolveResult | null> {
  if (hops > 6) return null;

  // Direct archive URL — no need to fetch
  if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(startUrl)) {
    return { fileUrl: startUrl };
  }

  // Known unsupported hosts
  if (/mega\.nz|drive\.google|mediafire|zippyshare/i.test(startUrl)) {
    try { return { unsupported: new URL(startUrl).hostname }; } catch { return null; }
  }

  try {
    const res = await fetch(startUrl, {
      headers: { ...UA, Referer: referer },
      redirect: "follow",
      signal,
    });

    // The final URL after all HTTP redirects
    const finalUrl = res.url;

    // Check if redirect landed on a direct file
    if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(finalUrl)) {
      return { fileUrl: finalUrl };
    }

    // Check Content-Type — binary/octet or application/* (non-HTML) = direct file
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

    // Look for a direct archive link in the page
    let foundFile = "";
    $("a[href]").each((_, el) => {
      const h = $(el).attr("href") || "";
      if (/\.(cbz|cbr|zip|rar)(\?[^"]*)?$/i.test(h)) {
        foundFile = h;
        return false;
      }
    });
    if (foundFile) return { fileUrl: foundFile };

    // meta-refresh redirect
    const metaRefresh = $('meta[http-equiv="refresh"]').attr("content") || "";
    const mrefMatch = metaRefresh.match(/url=(.+)/i);
    if (mrefMatch) {
      const nextUrl = mrefMatch[1].trim().replace(/['"]/g, "");
      return resolveToDirectFile(nextUrl, finalUrl, signal, hops + 1);
    }

    // Look for a prominent "click here" / "download" link to follow
    let nextHop = "";
    $("a[href]").each((_, el) => {
      const h = $(el).attr("href") || "";
      const t = $(el).text().trim().toLowerCase();
      if (
        h &&
        h !== "#" &&
        !h.startsWith("javascript") &&
        /\b(click here|download|get file|direct link|proceed)\b/i.test(t)
      ) {
        nextHop = h;
        return false;
      }
    });
    if (nextHop) return resolveToDirectFile(nextHop, finalUrl, signal, hops + 1);

    // GetComics-specific: look for a link back to getcomics or a CDN
    let gcLink = "";
    $("a[href]").each((_, el) => {
      const h = $(el).attr("href") || "";
      if (/getcomics\.(org|info)/i.test(h) || /\/(go|get)\//i.test(h)) {
        gcLink = h;
        return false;
      }
    });
    if (gcLink) return resolveToDirectFile(gcLink, finalUrl, signal, hops + 1);
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw e;
    // Network error — try nothing further
  }

  return null;
}
