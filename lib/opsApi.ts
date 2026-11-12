// Shared bits for the backup, update and sign-in API routes (pages/api).
import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "./auth";
import { checkCsrf } from "./csrf";

/** The signed-in admin, or null after sending the right error. */
export async function requireAdmin(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && !checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return null; }
  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Not signed in" }); return null; }
  if (!session.user.isAdmin) { res.status(403).json({ message: "Admins only" }); return null; }
  return session;
}

export async function requireUser(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && !checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return null; }
  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Not signed in" }); return null; }
  return session;
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
