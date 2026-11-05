import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).end(); return; }
  const session = await getApiSession(req, res);
  if (session.user) {
    res.json(session.user);
  } else {
    res.status(401).json({ user: null });
  }
}
