import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { requireAdmin } from "../../../lib/opsApi";
import { signOutEverywhere } from "../../../lib/signIns";

/** POST { userId }: signs that person out of every device. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  const session = await requireAdmin(req, res);
  if (!session) return;
  const id = Number(req.body?.userId);
  if (!Number.isInteger(id)) { res.status(400).json({ message: "Invalid user" }); return; }
  if (id === session.user!.id) { res.status(400).json({ message: "Use your profile to sign out your other devices" }); return; }
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) { res.status(404).json({ message: "User not found" }); return; }
  signOutEverywhere(id);
  res.json({ ok: true });
}
