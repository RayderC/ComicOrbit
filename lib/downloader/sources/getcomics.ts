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
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

// GetComics aggregates archives. Each "post" is essentially one chapter / issue / TPB.
// We model the post as a one-chapter series unless metadata reveals issue numbers.

function parseIssueNumber(title: string): number {
  const m = title.match(/#\s*(\d+(?:\.\d+)?)/) || title.match(/issue\s+(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 1;
}

export const getcomicsSource: Source = {
  id: "getcomics",
  type: "comic",

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`, { headers: UA });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("article.type-post").each((_, el) => {
      const $el = $(el);
      const titleLink = $el.find("h1 a, h2 a, .post-title a").first();
      const title = titleLink.text().trim();
      const url = titleLink.attr("href") || "";
      if (!title || !url) return;
      const cover = $el.find("img").first().attr("src") || $el.find("img").first().attr("data-src") || undefined;
      const excerpt = $el.find(".post-info, .entry-content").first().text().trim().slice(0, 280);
      const tags = $el.find(".cat-links a, .post-categories a").map((__, a) => $(a).text().trim()).get();

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

    // Fallback: older GetComics layouts use `.post-list-posts > .post`.
    if (results.length === 0) {
      $(".post-list-posts .post").each((_, el) => {
        const $el = $(el);
        const titleLink = $el.find(".post-title a").first();
        const title = titleLink.text().trim();
        const url = titleLink.attr("href") || "";
        if (!title || !url) return;
        results.push({
          source: "getcomics",
          type: "comic",
          title,
          url,
          cover: $el.find("img").first().attr("src") || undefined,
          description: "",
          status: "unknown",
          tags: [],
        });
      });
    }

    return results;
  },

  async getMetadata(url: string): Promise<SeriesMetadata> {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`GetComics metadata failed: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $(".post-title, h1.entry-title").first().text().trim() || $("title").text().split("-")[0].trim();
    const description = $(".post-contents p, .entry-content p").map((_, p) => $(p).text().trim()).get()
      .filter((t) => t && !/^download/i.test(t))
      .join("\n\n")
      .slice(0, 1500);

    const cover = $(".wp-post-image, .post-thumbnail img").first().attr("src")
      || $("article img").first().attr("src") || "";

    const tags = $(".post-categories a, .post-tags a").map((_, a) => $(a).text().trim()).get();

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
    // Each GetComics post = one CBZ/CBR archive. So a "series" here has one chapter.
    return [{
      externalId: url,
      number: parseIssueNumber(url.split("/").filter(Boolean).pop() || ""),
      title: "Issue",
    }];
  },

  async fetchChapter(ref: ChapterRef, onProgress: ProgressFn, signal): Promise<ChapterPayload> {
    // Grab the post page, find a direct download link.
    const postRes = await fetch(ref.externalId, { headers: UA, signal });
    if (!postRes.ok) throw new Error(`GetComics post failed: ${postRes.status}`);
    const html = await postRes.text();
    const $ = cheerio.load(html);

    const candidates: string[] = [];
    $("a").each((_, a) => {
      const href = $(a).attr("href") || "";
      const text = ($(a).text() || "").toLowerCase();
      if (!href) return;
      // Prefer obvious direct links.
      if (/\.(cbz|cbr|zip|rar)(\?|$)/i.test(href)) {
        candidates.unshift(href);
      } else if (/main server|download now|direct/i.test(text)) {
        candidates.push(href);
      }
    });

    // Resolve through GetComics' "Main Server" interstitial if necessary.
    const direct = await resolveDirectLink(candidates, signal);
    if (!direct) {
      const host = pickAnyHost(candidates);
      return { kind: "unsupported_host", host: host || "unknown", url: ref.externalId };
    }

    const ext = (direct.match(/\.(cbz|cbr|zip|rar)(?:\?|$)/i)?.[1].toLowerCase() || "cbz") as "cbz" | "cbr" | "zip";
    onProgress(0, 1);
    const fileRes = await fetch(direct, { headers: UA, signal });
    if (!fileRes.ok) throw new Error(`File download failed: ${fileRes.status}`);
    const buf = Buffer.from(await fileRes.arrayBuffer());
    onProgress(1, 1);
    return { kind: "archive", data: buf, ext };
  },
};

async function resolveDirectLink(candidates: string[], signal?: AbortSignal): Promise<string | null> {
  for (const href of candidates) {
    if (/\.(cbz|cbr|zip|rar)(\?|$)/i.test(href)) return href;
    // Try fetching the candidate page and look for a meta-refresh or another direct link.
    try {
      const r = await fetch(href, { headers: UA, redirect: "follow", signal });
      if (!r.ok) continue;
      const finalUrl = r.url;
      if (/\.(cbz|cbr|zip|rar)(\?|$)/i.test(finalUrl)) return finalUrl;
      const html = await r.text();
      const $$ = cheerio.load(html);
      let found = "";
      $$("a").each((_, a) => {
        const h = $$(a).attr("href") || "";
        if (/\.(cbz|cbr|zip|rar)(\?|$)/i.test(h)) { found = h; return false; }
      });
      if (found) return found;
      // <meta http-equiv="refresh" content="0;url=https://...">
      const meta = $$('meta[http-equiv="refresh"]').attr("content") || "";
      const m = meta.match(/url=(.+)/i);
      if (m && /\.(cbz|cbr|zip|rar)/i.test(m[1])) return m[1].trim();
    } catch { /* try next */ }
  }
  return null;
}

function pickAnyHost(urls: string[]): string | null {
  for (const u of urls) {
    try { return new URL(u).hostname; } catch { /* ignore */ }
  }
  return null;
}
