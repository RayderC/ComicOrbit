import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";
import { checkCsrf } from "../../lib/csrf";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }
  const session = await getApiSession(req, res);
  session.destroy();
  res.json({ ok: true });
}
