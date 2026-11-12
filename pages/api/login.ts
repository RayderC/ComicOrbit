import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";
import bcrypt from "bcryptjs";
import { getApiSession } from "../../lib/auth";
import { checkCsrf } from "../../lib/csrf";
import { clientIp } from "../../lib/clientIp";
import { verifyWerkzeugHash } from "../../lib/legacyPassword";
import { checkRateLimit } from "../../lib/rateLimit";
import { recordSignIn } from "../../lib/signIns";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  // 10 attempts per minute per IP.
  if (!checkRateLimit(`login:${clientIp(req)}`, 10, 60_000)) {
    res.status(429).json({ message: "Too many login attempts. Try again in a minute." });
    return;
  }

  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ message: "Missing field(s)" });
    return;
  }

  const name = username.toLowerCase();
  // A per-account limit too, so guessing one password from many addresses still gets slowed down.
  if (!checkRateLimit(`login-user:${name}`, 30, 10 * 60_000)) {
    res.status(429).json({ message: "Too many login attempts. Try again in a minute." });
    return;
  }

  const row = db
    .prepare("SELECT id, username, password, legacy_password, is_admin, token_version FROM users WHERE LOWER(username) = ?")
    .get(name) as
    | { id: number; username: string; password: string; legacy_password: string; is_admin: number; token_version: number }
    | undefined;

  if (!row) {
    // Takes as long as a wrong password, so response time doesn't reveal which usernames exist.
    await bcrypt.compare(password, DUMMY_HASH);
    res.status(400).json({ message: "Invalid credentials" });
    return;
  }

  let authed = false;

  if (row.password && await bcrypt.compare(password, row.password)) {
    authed = true;
  } else if (row.legacy_password && verifyWerkzeugHash(row.legacy_password, password)) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password = ?, legacy_password = '' WHERE id = ?").run(hash, row.id);
    authed = true;
  }

  if (!authed) {
    recordSignIn(row.id, req, false);
    res.status(400).json({ message: "Invalid credentials" });
    return;
  }

  const session = await getApiSession(req, res);
  session.user = { id: row.id, username: row.username, isAdmin: row.is_admin === 1, v: row.token_version };
  await session.save();
  recordSignIn(row.id, req);

  res.json({ ok: true, user: session.user });
}
