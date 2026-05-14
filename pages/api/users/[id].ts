import type { NextApiRequest, NextApiResponse } from "next";
import db, { adminCount } from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";

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
    const target = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(id) as { is_admin: number } | undefined;
    if (!target) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (target.is_admin === 1 && adminCount() <= 1) {
      res.status(400).json({ message: "Cannot delete the last remaining admin" });
      return;
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
