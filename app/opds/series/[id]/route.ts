import { NextRequest, NextResponse } from "next/server";
import { authenticateBasic, BASIC_CHALLENGE } from "@/lib/basicAuth";
import { feedToXml, nowIso, OPDS_ACQUISITION_TYPE, CBZ_MIME } from "@/lib/opds";
import db from "@/lib/db";

export const runtime = "nodejs";

interface SeriesRow {
  id: number;
  title: string;
  description: string;
  updated_at: string;
  cover_path: string;
}

interface ChapterRow {
  id: number;
  number: number;
  title: string;
  downloaded_at: string;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateBasic(req);
  if (!user) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE },
    });
  }

  const { id } = await ctx.params;
  const seriesId = Number(id);
  if (!Number.isFinite(seriesId)) return new NextResponse("Bad id", { status: 400 });

  const series = db.prepare(`
    SELECT id, title, description, updated_at, cover_path FROM series WHERE id = ?
  `).get(seriesId) as SeriesRow | undefined;
  if (!series) return new NextResponse("Series not found", { status: 404 });

  const chapters = db.prepare(`
    SELECT id, number, title, downloaded_at
    FROM chapters WHERE series_id = ?
    ORDER BY number ASC
  `).all(seriesId) as ChapterRow[];

  const xml = feedToXml({
    id: `urn:comicorbit:series:${series.id}`,
    title: series.title,
    updated: series.updated_at,
    selfHref: `/opds/series/${series.id}`,
    upHref: "/opds/library",
    startHref: "/opds",
    entries: chapters.map((c) => {
      const label = formatChapterLabel(c.number, c.title);
      return {
        id: `urn:comicorbit:chapter:${c.id}`,
        title: label,
        updated: c.downloaded_at,
        links: [
          {
            rel: "http://opds-spec.org/acquisition",
            href: `/opds/cbz/${c.id}`,
            type: CBZ_MIME,
            title: "Download CBZ",
          },
          ...(series.cover_path
            ? [
                { rel: "http://opds-spec.org/image/thumbnail", href: `/opds/cover/${series.id}`, type: "image/jpeg" },
              ]
            : []),
        ],
      };
    }),
  });

  return new NextResponse(xml, {
    headers: { "Content-Type": OPDS_ACQUISITION_TYPE },
  });
}

function formatChapterLabel(num: number, title: string): string {
  const n = Number.isInteger(num) ? String(num) : num.toFixed(1);
  return title ? `Chapter ${n}: ${title}` : `Chapter ${n}`;
}
