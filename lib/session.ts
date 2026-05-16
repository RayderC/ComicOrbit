import { SessionOptions } from "iron-session";

export type User = { id: number; username: string; isAdmin?: boolean };

declare module "iron-session" {
  interface IronSessionData {
    user?: User;
  }
}

const isBuild = process.env.NEXT_PHASE === "phase-production-build";

const sessionPassword =
  process.env.SESSION_SECRET ||
  (isBuild || process.env.NODE_ENV !== "production"
    ? "build_time_placeholder_secret_at_least_32_chars"
    : "");

if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error(
    "SESSION_SECRET environment variable must be set to a string of at least 32 characters"
  );
}

// Default false so plain-HTTP local-network access works out of the box.
// Set SESSION_COOKIE_SECURE=true if you terminate TLS in front of this app.
const secureCookie =
  process.env.SESSION_COOKIE_SECURE != null
    ? process.env.SESSION_COOKIE_SECURE === "true"
    : false;

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: "comicorbit_session",
  cookieOptions: {
    secure: secureCookie,
  },
};
