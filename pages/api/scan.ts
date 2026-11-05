import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";
import { scanAllSeries } from "../../lib/downloader";
import { checkCsrf } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/rateLimit";

export const config = { api: { bodyParser: { sizeLimit: "1kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  // Scan fans out to external sources — limit to 2 per 10 minutes per admin.
  if (!checkRateLimit(`scan:${session.user.id}`, 2, 10 * 60_000)) {
    res.status(429).json({ message: "Scan already in progress. Try again in a few minutes." });
    return;
  }

  // Fire and forget — returns immediately; scan runs in the background
  scanAllSeries().catch((e) => console.error("[scan] error:", e));
  res.json({ ok: true });
}
