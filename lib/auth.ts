import { getIronSession, type IronSession } from "iron-session";
import type { NextApiRequest, NextApiResponse } from "next";
import db from "./db";
import { sessionOptions, type User } from "./session";

export type SessionData = { user?: User };
type Row = { id: number; username: string; is_admin: number; token_version: number };

/** The current account for a session's user, or null if it was deleted or its password has changed since. */
export function currentUser(user: User): User | null {
  const row = db.prepare("SELECT id, username, is_admin, token_version FROM users WHERE id = ?").get(user.id) as Row | undefined;
  if (!row || (row.token_version ?? 0) !== (user.v ?? 0)) return null;
  return { id: row.id, username: row.username, isAdmin: row.is_admin === 1, v: row.token_version };
}

/**
 * Checks the session cookie against the current account. The cookie alone would keep a deleted
 * user, a demoted admin or a stolen session working until it expired.
 */
export function verify(session: IronSession<SessionData>) {
  if (!session.user) return session;
  const user = currentUser(session.user);
  if (user) session.user = user;
  else session.destroy();
  return session;
}

/** For pages/api routes. */
export async function getApiSession(req: NextApiRequest, res: NextApiResponse) {
  return verify(await getIronSession<SessionData>(req, res, sessionOptions));
}
