import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "../../lib/opsApi";
import { listSignIns, signOutEverywhere } from "../../lib/signIns";

/** GET: your recent sign-ins. POST: sign out every other device and keep this one. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireUser(req, res);
  if (!session) return;
  const user = session.user!;
  if (req.method === "GET") { res.json(listSignIns(user.id)); return; }
  if (req.method === "POST") {
    session.user = { ...user, v: signOutEverywhere(user.id) };
    await session.save();
    res.json({ ok: true });
    return;
  }
  res.status(405).end();
}
