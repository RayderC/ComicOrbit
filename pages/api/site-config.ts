import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";
import { getSiteConfig, setSiteConfigKey } from "../../lib/db";
import { checkCsrf } from "../../lib/csrf";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

const EDITABLE_KEYS = new Set([
  "SITE_NAME",
  "MANGA_DIRECTORY",
  "tagline",
  "description",
  "VAPID_SUBJECT",
]);

function validateValue(key: string, value: string): string | null {
  if (key === "VAPID_SUBJECT") {
    const v = value.trim();
    if (v === "") return null; // clearing -> use default
    if (!v.startsWith("mailto:") && !v.startsWith("https://")) {
      return "VAPID_SUBJECT must start with mailto: or https://";
    }
    if (v.startsWith("mailto:")) {
      const email = v.slice("mailto:".length);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "VAPID_SUBJECT mailto must include a real domain (Apple rejects fake ones)";
      }
    }
    if (v.length > 254) return "VAPID_SUBJECT too long";
  }
  return null;
}

/** The private push key has no reason to leave the server, even to an admin's browser. */
function visibleConfig() {
  const { VAPID_PRIVATE_KEY: _private, ...rest } = getSiteConfig();
  return rest;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) return res.status(403).json({ message: "Forbidden" });

  if (req.method === "GET") {
    return res.json(visibleConfig());
  }

  if (req.method === "PUT") {
    if (!checkCsrf(req)) return res.status(403).json({ message: "Forbidden" });

    const updates = req.body ?? {};
    for (const [key, value] of Object.entries(updates)) {
      if (!EDITABLE_KEYS.has(key)) continue;
      const str = value == null ? "" : String(value);
      const err = validateValue(key, str);
      if (err) return res.status(400).json({ message: err });
      setSiteConfigKey(key, str);
    }

    return res.json(visibleConfig());
  }

  return res.status(405).end();
}
