import type { NextApiRequest, NextApiResponse } from "next";
import { ssoConfig, startSso } from "../../../lib/sso";

// GET: { enabled }, for the login page. GET ?start=1: off to Amethyst to sign in.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  if (req.query.start) return startSso(req, res);
  res.json({ enabled: !!ssoConfig() });
}
