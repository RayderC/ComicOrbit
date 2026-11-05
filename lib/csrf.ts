import type { NextApiRequest } from "next";

/**
 * CSRF check for state-changing requests. Browsers set Sec-Fetch-Site and Origin themselves and
 * pages can't fake them. Requests with neither (curl, scripts) carry no ambient browser session risk.
 */
export function checkCsrf(req: NextApiRequest): boolean {
  if (req.headers["sec-fetch-site"] === "same-origin") return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  const forwarded = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim() || req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
