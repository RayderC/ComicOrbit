import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../../lib/auth";
import { checkCsrf } from "../../../lib/csrf";
import db from "../../../lib/db";
import { sendPushToUser } from "../../../lib/webpush";

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  // GET: return all users with their push subscription status
  if (req.method === "GET") {
    const users = db.prepare(`
      SELECT u.id, u.username,
             CASE WHEN ps.user_id IS NOT NULL THEN 1 ELSE 0 END as has_push
      FROM users u
      LEFT JOIN (SELECT DISTINCT user_id FROM push_subscriptions) ps ON ps.user_id = u.id
      ORDER BY u.username
    `).all() as { id: number; username: string; has_push: number }[];
    res.json(users);
    return;
  }

  if (req.method === "POST") {
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

    const { userIds, title, body } = req.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ message: "Select at least one user" });
      return;
    }
    const cleanTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 100) : "ComicOrbit";
    const cleanBody = typeof body === "string" && body.trim() ? body.trim().slice(0, 200) : "Test notification from admin";

    let sent = 0;
    let noSub = 0;

    await Promise.all(
      (userIds as unknown[])
        .filter((id) => Number.isFinite(Number(id)))
        .map(async (id) => {
          const subCount = (db.prepare(
            "SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id = ?"
          ).get(Number(id)) as { c: number }).c;

          if (subCount === 0) { noSub++; return; }

          await sendPushToUser(Number(id), { title: cleanTitle, body: cleanBody, url: "/" });
          sent++;
        })
    );

    res.json({ ok: true, sent, noSub });
    return;
  }

  res.status(405).end();
}
