import type { NextApiRequest, NextApiResponse } from "next";
import db, { adminCount } from "../../../lib/db";
import bcrypt from "bcryptjs";
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

  if (req.method === "PATCH") {
    const target = db.prepare("SELECT id, is_admin FROM users WHERE id = ?").get(id) as
      | { id: number; is_admin: number }
      | undefined;
    if (!target) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const { username, password, isAdmin } = req.body ?? {};

    if (typeof isAdmin === "boolean" && !isAdmin && target.is_admin === 1 && adminCount() <= 1) {
      res.status(400).json({ message: "Cannot remove admin from the last remaining admin" });
      return;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];

    if (username && typeof username === "string") {
      const clean = username.trim().toLowerCase();
      if (clean.length < 2) {
        res.status(400).json({ message: "Username must be at least 2 characters" });
        return;
      }
      sets.push("username = ?");
      vals.push(clean);
    }

    if (password && typeof password === "string") {
      if (password.length < 5) {
        res.status(400).json({ message: "Password must be at least 5 characters" });
        return;
      }
      sets.push("password = ?");
      vals.push(bcrypt.hashSync(password, 10));
    }

    if (typeof isAdmin === "boolean") {
      sets.push("is_admin = ?");
      vals.push(isAdmin ? 1 : 0);
    }

    if (sets.length === 0) {
      res.status(400).json({ message: "Nothing to update" });
      return;
    }

    try {
      db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ message: "Username already taken" });
    }
    return;
  }

  res.status(405).end();
}
