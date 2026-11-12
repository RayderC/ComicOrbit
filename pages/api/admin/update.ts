import type { NextApiRequest, NextApiResponse } from "next";
import { one, requireAdmin } from "../../../lib/opsApi";
import { checkForUpdate } from "../../../lib/updateCore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).end(); return; }
  if (!(await requireAdmin(req, res))) return;
  res.json(await checkForUpdate("rayderc/comicorbit", one(req.query.force) === "1"));
}
