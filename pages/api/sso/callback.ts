import type { NextApiRequest, NextApiResponse } from "next";
import { finishSso } from "../../../lib/sso";

// Amethyst sends the browser back here with a signed pass.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  return finishSso(req, res);
}
