import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../../lib/auth";
import db from "../../../lib/db";
import { ensureVapidKeys } from "../../../lib/webpush";
import { checkCsrf } from "../../../lib/csrf";

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };

// Only accept push endpoints from real browser push services. Without this an
// attacker could register their own URL and the server would make VAPID-signed
// POSTs to it on every push event (SSRF + signed-request abuse).
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Login required" }); return; }

  if (req.method === "GET") {
    const { publicKey } = ensureVapidKeys();
    const sub = db.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id = ? LIMIT 1")
      .get(session.user.id) as { endpoint: string } | undefined;
    res.json({ publicKey, subscribed: !!sub });
    return;
  }

  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  if (req.method === "POST") {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string" || keys.p256dh.length > 300 || keys.auth.length > 300) {
      res.status(400).json({ message: "Invalid subscription object" });
      return;
    }
    if (typeof endpoint !== "string" || endpoint.length > 2000) {
      res.status(400).json({ message: "Invalid endpoint" });
      return;
    }
    if (!isAllowedPushEndpoint(endpoint)) {
      res.status(400).json({ message: "Unsupported push service" });
      return;
    }
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `).run(session.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { endpoint } = req.body ?? {};
    if (endpoint) {
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
        .run(session.user.id, endpoint);
    } else {
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(session.user.id);
    }
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
