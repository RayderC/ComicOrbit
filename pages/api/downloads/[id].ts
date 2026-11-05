import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";
import { cancelJob } from "../../../lib/downloader";
import { checkCsrf } from "../../../lib/csrf";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  if (req.method === "DELETE") {
    cancelJob(id);
    db.prepare("DELETE FROM download_queue WHERE id = ?").run(id);
    res.json({ ok: true });
    return;
  }

  if (req.method === "POST") {
    const { action } = req.body ?? {};
    if (typeof action !== "string") {
      res.status(400).json({ message: "action required" });
      return;
    }
    if (action === "retry") {
      db.prepare("UPDATE download_queue SET status = 'queued', error_message = '', progress_pct = 0 WHERE id = ?").run(id);
      res.json({ ok: true });
      return;
    }
    if (action === "pause") {
      cancelJob(id);
      res.json({ ok: true });
      return;
    }
    res.status(400).json({ message: "Unknown action" });
    return;
  }

  res.status(405).end();
}
