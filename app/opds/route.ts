import { NextRequest, NextResponse } from "next/server";
import { authenticateBasic, BASIC_CHALLENGE } from "@/lib/basicAuth";
import { feedToXml, nowIso, OPDS_NAVIGATION_TYPE, OPDS_ACQUISITION_TYPE } from "@/lib/opds";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authenticateBasic(req);
  if (!user) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE },
    });
  }

  const xml = feedToXml({
    id: "urn:comicorbit:catalog",
    title: "ComicOrbit",
    updated: nowIso(),
    selfHref: "/opds",
    startHref: "/opds",
    entries: [
      {
        id: "urn:comicorbit:catalog:library",
        title: "Library",
        updated: nowIso(),
        summary: "All series in your library",
        links: [
          { rel: "subsection", href: "/opds/library", type: OPDS_ACQUISITION_TYPE },
        ],
      },
      {
        id: "urn:comicorbit:catalog:favorites",
        title: "Favorites",
        updated: nowIso(),
        summary: "Series you've favorited",
        links: [
          { rel: "subsection", href: "/opds/favorites", type: OPDS_ACQUISITION_TYPE },
        ],
      },
    ],
  });

  return new NextResponse(xml, {
    headers: { "Content-Type": OPDS_NAVIGATION_TYPE },
  });
}
