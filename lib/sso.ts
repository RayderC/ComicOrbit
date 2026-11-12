// "Sign in with Amethyst": settings, and the two halves of the sign-in (off to Amethyst, back with a pass).
import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import db, { getSiteConfig, setSiteConfigKey } from "./db";
import { getApiSession } from "./auth";
import { recordSignIn } from "./signIns";
import { amethystOrigin, isGoodSecret, originFrom, verifyPass } from "./ssoCore";

export const SSO_APP = "comicorbit";
const COOKIE = "comicorbit_sso_state";

export function ssoConfig(): { url: string; secret: string; fromEnv: boolean } | null {
  const envUrl = process.env.AMETHYST_URL, envSecret = process.env.AMETHYST_SSO_SECRET;
  const envOrigin = amethystOrigin(envUrl);
  if (envOrigin && isGoodSecret(envSecret)) return { url: envOrigin, secret: envSecret.trim(), fromEnv: true };
  const c = getSiteConfig();
  return c.sso_url && isGoodSecret(c.sso_secret) ? { url: c.sso_url, secret: c.sso_secret.trim(), fromEnv: false } : null;
}

export function saveSsoConfig(v: { url: string; secret: string } | null) {
  setSiteConfigKey("sso_url", v ? v.url : "");
  setSiteConfigKey("sso_secret", v ? v.secret : "");
}

const originOf = (req: NextApiRequest) => originFrom(n => req.headers[n]);
const cookie = (value: string, origin: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/api/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;

export function startSso(req: NextApiRequest, res: NextApiResponse) {
  const cfg = ssoConfig();
  const origin = originOf(req);
  if (!cfg) return res.redirect(302, "/login?sso_error=Sign+in+with+Amethyst+isn%27t+set+up");
  const state = crypto.randomBytes(24).toString("base64url");
  const to = new URL("/sso", cfg.url);
  to.search = new URLSearchParams({ app: SSO_APP, return: `${origin}/api/sso/callback`, state }).toString();
  res.setHeader("Set-Cookie", cookie(state, origin, 600));
  res.redirect(302, to.toString());
}

export async function finishSso(req: NextApiRequest, res: NextApiResponse) {
  const origin = originOf(req);
  const fail = (msg: string) => {
    res.setHeader("Set-Cookie", cookie("", origin, 0));
    res.redirect(302, `/login?sso_error=${encodeURIComponent(msg)}`);
  };
  const cfg = ssoConfig();
  if (!cfg) return fail("Sign in with Amethyst isn't set up here.");
  const saved = req.cookies[COOKIE] ?? "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!saved || saved !== state) return fail("That sign-in didn't start here. Try again.");
  let sub: string;
  try { sub = verifyPass(cfg.secret, req.query.token, { aud: origin, nonce: saved, app: SSO_APP }).sub; }
  catch (e) { return fail((e as Error).message); }
  const user = db.prepare("SELECT id, username, is_admin, token_version FROM users WHERE LOWER(username) = ?").get(sub.toLowerCase()) as
    { id: number; username: string; is_admin: number; token_version: number } | undefined;
  if (!user) return fail(`There's no ComicOrbit account named "${sub}". Ask an admin to make one with that name.`);
  const session = await getApiSession(req, res);
  session.user = { id: user.id, username: user.username, isAdmin: user.is_admin === 1, v: user.token_version };
  await session.save();
  recordSignIn(user.id, req);
  // iron-session set its cookie already; add ours (cleared) alongside it.
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), cookie("", origin, 0)]);
  res.redirect(302, "/");
}
