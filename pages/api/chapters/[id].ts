import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import fs from "fs";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") { res.status(405).end(); return; }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const chapter = db.prepare("SELECT id, file_path FROM chapters WHERE id = ?").get(id) as
    | { id: number; file_path: string }
    | undefined;
  if (!chapter) { res.status(404).json({ message: "Chapter not found" }); return; }

  db.prepare("DELETE FROM chapters WHERE id = ?").run(id);

  if (chapter.file_path && fs.existsSync(chapter.file_path)) {
    try { fs.unlinkSync(chapter.file_path); } catch { /* ignore */ }
  }

  res.json({ ok: true });
}
