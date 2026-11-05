import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { currentUser, verify, type SessionData } from "./auth";
import { sessionOptions } from "./session";

/** For app/ route handlers. */
export async function getVerifiedSession() {
  return verify(await getIronSession<SessionData>(await cookies(), sessionOptions));
}

/** For server components, which can't change cookies: same check, but leaves a stale cookie alone. */
export async function getPageSession(): Promise<SessionData> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const user = session.user ? currentUser(session.user) : null;
  return user ? { user } : {};
}
