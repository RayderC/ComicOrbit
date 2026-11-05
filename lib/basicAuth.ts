import bcrypt from "bcryptjs";
import crypto from "crypto";
import db from "./db";
import { verifyWerkzeugHash } from "./legacyPassword";
import { checkRateLimit, isRateLimited } from "./rateLimit";
import { headerIp } from "./clientIp";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export interface BasicAuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

// OPDS clients send credentials as HTTP Basic. We don't issue tokens — they
// auth on every request with their own username + password, validated against
// the same users table as the web UI.
export function parseBasic(header: string | null): { username: string; password: string } | null {
  if (!header) return null;
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

type AuthRow = { id: number; username: string; password: string; legacy_password: string; is_admin: number };

// Readers send the password on every request (a library page can be dozens of cover fetches), so a
// recent success is remembered briefly. Keyed by a hash of the full header, never the password itself.
const recent = new Map<string, { user: BasicAuthUser; hash: string; until: number }>();
const REMEMBER_MS = 60_000;

const cacheKey = (header: string) => crypto.createHash("sha256").update(header).digest("hex");

export async function authenticateBasic(req: { headers: Headers }): Promise<BasicAuthUser | null> {
  const header = req.headers.get("authorization");
  const creds = parseBasic(header);
  if (!creds) return null;

  const key = cacheKey(header!);
  const name = creds.username.toLowerCase();
  const hit = recent.get(key);
  const row = db
    .prepare("SELECT id, username, password, legacy_password, is_admin FROM users WHERE LOWER(username) = ?")
    .get(name) as AuthRow | undefined;

  // Still valid only if the account's password hash is unchanged, so a password change takes effect at once.
  if (hit && hit.until > Date.now() && row && hit.hash === (row.password || row.legacy_password)) {
    return { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
  }

  const ip = headerIp((n) => req.headers.get(n));
  // Only failures count: a reader opening a library sends many correct requests at once.
  if (isRateLimited(`opds:${ip}`, 10) || isRateLimited(`opds-user:${name}`, 30)) return null;

  let ok = false;
  if (!row) await bcrypt.compare(creds.password, DUMMY_HASH);
  else if (row.password) ok = await bcrypt.compare(creds.password, row.password);
  // Don't upgrade hashes here — that's the login flow's job.
  else if (row.legacy_password) ok = verifyWerkzeugHash(row.legacy_password, creds.password);
  if (!ok || !row) {
    checkRateLimit(`opds:${ip}`, 10, 60_000);
    checkRateLimit(`opds-user:${name}`, 30, 10 * 60_000);
    return null;
  }

  const user = { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
  if (recent.size > 500) recent.clear();
  recent.set(key, { user, hash: row.password || row.legacy_password, until: Date.now() + REMEMBER_MS });
  return user;
}

export const BASIC_CHALLENGE = 'Basic realm="ComicOrbit OPDS", charset="UTF-8"';
