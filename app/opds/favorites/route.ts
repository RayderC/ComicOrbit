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
    SELECT s.id, s.title, s.description, s.updated_at, s.cover_path
    FROM series s
    JOIN favorites f ON f.series_id = s.id
    WHERE f.user_id = ?
    ORDER BY s.title COLLATE NOCASE ASC
  `).all(user.id) as SeriesRow[];

  const xml = feedToXml({
    id: "urn:comicorbit:favorites",
    title: "Favorites",
    updated: nowIso(),
    selfHref: "/opds/favorites",
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
