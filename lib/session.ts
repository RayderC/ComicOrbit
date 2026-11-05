import { SessionOptions } from "iron-session";

/** `v` is the account's token_version at sign-in. Changing a password bumps it, which ends other sessions. */
export type User = { id: number; username: string; isAdmin?: boolean; v?: number };

declare module "iron-session" {
  interface IronSessionData {
    user?: User;
  }
}

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isDev = process.env.NODE_ENV !== "production";

// In production: SESSION_SECRET is mandatory. In dev/build: fall back to a
// known placeholder so the build pipeline doesn't need the variable set.
const sessionPassword = process.env.SESSION_SECRET ||
  (isBuild || isDev ? "build_time_placeholder_secret_at_least_32_chars" : "");

if (!isBuild && !isDev && (!sessionPassword || sessionPassword === "build_time_placeholder_secret_at_least_32_chars")) {
  throw new Error(
    "SESSION_SECRET environment variable must be set to a random string of at least 32 characters in production"
  );
}

if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error(
    "SESSION_SECRET must be at least 32 characters"
  );
}

// Secure by default in production — set SESSION_COOKIE_SECURE=false explicitly
// for plain-HTTP local-network installs.
const secureCookieEnv = process.env.SESSION_COOKIE_SECURE;
const secureCookie = secureCookieEnv == null ? !isDev : secureCookieEnv === "true";

if (!isBuild && !isDev && !secureCookie) {
  console.warn(
    "[session] WARNING: SESSION_COOKIE_SECURE=false. " +
    "Session cookies will be sent over HTTP. " +
    "Only use this on a trusted local network."
  );
}

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: "comicorbit_session",
  cookieOptions: {
    secure: secureCookie,
    httpOnly: true,
    sameSite: "lax",
  },
};
