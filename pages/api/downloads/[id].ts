import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";
import { cancelJob } from "../../../lib/downloader";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
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
  }

  res.status(405).end();
}
