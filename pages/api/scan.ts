import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../lib/session";
import { scanAllSeries } from "../../lib/downloader";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  // Fire and forget — returns immediately; scan runs in the background
  scanAllSeries().catch((e) => console.error("[scan] error:", e));
  res.json({ ok: true });
}
