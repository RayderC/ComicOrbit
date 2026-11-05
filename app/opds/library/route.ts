import { NextRequest, NextResponse } from "next/server";
import { authenticateBasic, BASIC_CHALLENGE } from "@/lib/basicAuth";
import { feedToXml, nowIso, OPDS_NAVIGATION_TYPE } from "@/lib/opds";
import db from "@/lib/db";

export const runtime = "nodejs";

interface SeriesRow {
  id: number;
  title: string;
  description: string;
  updated_at: string;
  cover_path: string;
}

export async function GET(req: NextRequest) {
  const user = await authenticateBasic(req);
  if (!user) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE },
    });
  }

  const series = db.prepare(`
    SELECT id, title, description, updated_at, cover_path
    FROM series
    ORDER BY title COLLATE NOCASE ASC
  `).all() as SeriesRow[];

  const xml = feedToXml({
    id: "urn:comicorbit:library",
    title: "Library",
    updated: nowIso(),
    selfHref: "/opds/library",
    upHref: "/opds",
    startHref: "/opds",
    entries: series.map((s) => ({
      id: `urn:comicorbit:series:${s.id}`,
      title: s.title,
      updated: s.updated_at,
      summary: s.description || undefined,
      links: [
        { rel: "subsection", href: `/opds/series/${s.id}`, type: OPDS_NAVIGATION_TYPE },
        ...(s.cover_path
          ? [
              { rel: "http://opds-spec.org/image", href: `/opds/cover/${s.id}`, type: "image/jpeg" },
              { rel: "http://opds-spec.org/image/thumbnail", href: `/opds/cover/${s.id}`, type: "image/jpeg" },
            ]
          : []),
      ],
    })),
  });

  return new NextResponse(xml, {
    headers: { "Content-Type": OPDS_NAVIGATION_TYPE },
  });
}
