import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";
import { multiSearch, MANGA_SOURCES } from "../../lib/downloader/sources";
import { checkRateLimit } from "../../lib/rateLimit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  // 20 searches per minute per user — each search fans out to multiple external sources.
  if (!checkRateLimit(`search:${session.user.id}`, 20, 60_000)) {
    res.status(429).json({ message: "Too many search requests. Try again in a minute." });
    return;
  }

  const q = (req.query.q || "").toString().trim();
  const type = (req.query.type || "").toString();
  if (!q) {
    res.json({ results: [] });
    return;
  }

  const sources = Array.from(MANGA_SOURCES);

  const results = await multiSearch(sources, q);
  res.json({ results });
}
