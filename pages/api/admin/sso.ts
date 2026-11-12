import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../lib/opsApi";
import { saveSsoConfig, ssoConfig } from "../../../lib/sso";
import { isGoodSecret } from "../../../lib/ssoCore";

const status = () => {
  const c = ssoConfig();
  return { enabled: !!c, url: c?.url ?? null, hint: c ? c.secret.slice(-4) : null, fromEnv: !!c?.fromEnv };
};

/** GET: on or off. PUT { url, secret } turns it on; PUT { off: true } turns it off. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method === "GET") return res.json(status());
  if (req.method !== "PUT") return res.status(405).end();
  const body = req.body ?? {};
  if (body.off) { saveSsoConfig(null); return res.json(status()); }
  let url: URL;
  try { url = new URL(String(body.url ?? "").trim()); } catch { return res.status(400).json({ message: "Put in Amethyst's address, like http://192.168.1.5:3000" }); }
  if (!/^https?:$/.test(url.protocol)) return res.status(400).json({ message: "Amethyst's address needs to start with http:// or https://" });
  const secret = String(body.secret ?? "").trim();
  if (!isGoodSecret(secret)) return res.status(400).json({ message: "Paste the whole shared secret from Amethyst (Dashboard → System)" });
  saveSsoConfig({ url: url.origin, secret });
  res.json(status());
}
