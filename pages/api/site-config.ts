import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../lib/session";
import { getSiteConfig, setSiteConfigKey } from "../../lib/db";

const EDITABLE_KEYS = new Set([
  "SITE_NAME",
  "MANGA_DIRECTORY",
  "COMICS_DIRECTORY",
  "tagline",
  "description",
  "default_manga_source",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.json(getSiteConfig());
  }

  if (req.method === "PUT") {
    const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
    if (!session.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

    const updates = req.body ?? {};
    for (const [key, value] of Object.entries(updates)) {
      if (!EDITABLE_KEYS.has(key)) continue;
      setSiteConfigKey(key, value == null ? "" : String(value));
    }

    return res.json(getSiteConfig());
  }

  res.status(405).end();
}
