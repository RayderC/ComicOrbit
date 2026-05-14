import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../lib/session";
import { multiSearch, MANGA_SOURCES, COMIC_SOURCES } from "../../lib/downloader/sources";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const q = (req.query.q || "").toString().trim();
  const type = (req.query.type || "").toString();
  if (!q) {
    res.json({ results: [] });
    return;
  }

  const sources =
    type === "manga" ? Array.from(MANGA_SOURCES) :
    type === "comic" ? Array.from(COMIC_SOURCES) :
    [...MANGA_SOURCES, ...COMIC_SOURCES];

  const results = await multiSearch(sources, q);
  res.json({ results });
}
