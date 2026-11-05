import dns from "dns/promises";
import net from "net";

/**
 * Returns true if the URL is safe to fetch server-side.
 * Blocks private/loopback IP ranges to prevent SSRF attacks.
 *
 * Synchronous version: catches literal IP addresses and obvious bad hostnames
 * but does NOT resolve DNS. For paths that fetch arbitrary URLs, prefer
 * `isSafeExternalUrlResolved` which additionally checks the resolved IPs and
 * defends against DNS rebinding.
 */
export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Reject userinfo (URLs like https://attacker.com@internal/...).
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  const bare = host.replace(/\.$/, ""); // "localhost." resolves the same as "localhost"
  if (bare === "localhost" || bare.endsWith(".localhost")) return false;
  if (host === "::" || host === "[::]") return false;
  if (host === "::1" || host === "[::1]") return false;

  // Strip brackets for IPv6 host parsing.
  const ipCandidate = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;

  const ipFamily = net.isIP(ipCandidate);
  if (ipFamily === 4) {
    return !isPrivateIPv4(ipCandidate);
  }
  if (ipFamily === 6) {
    return !isPrivateIPv6(ipCandidate);
  }

  // Block ambiguous numeric hostnames (e.g. http://2130706433/ = 127.0.0.1).
  // After this, only true DNS hostnames remain — caller should resolve and
  // re-check via isSafeExternalUrlResolved for stronger guarantees.
  if (/^[0-9.]+$/.test(host) || /^0x/i.test(host) || /^[0-9]+$/.test(host)) {
    return false;
  }

  return true;
}

/**
 * Stronger SSRF check that resolves the hostname and verifies every resolved
 * IP is public. Defends against DNS rebinding and hostnames that point to
 * private space. Use this anywhere the URL ultimately comes from untrusted
 * input (proxies, scraper-supplied cover URLs, etc).
 */
export async function isSafeExternalUrlResolved(raw: string): Promise<boolean> {
  if (!isSafeExternalUrl(raw)) return false;

  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Literal IPs already validated by isSafeExternalUrl.
  if (net.isIP(host)) return true;

  try {
    const records = await dns.lookup(host, { all: true });
    for (const r of records) {
      if (r.family === 4 && isPrivateIPv4(r.address)) return false;
      if (r.family === 6 && isPrivateIPv6(r.address)) return false;
    }
    return records.length > 0;
  } catch {
    return false;
  }
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 127) return true;                          // loopback
  if (a === 169 && b === 254) return true;             // link-local / AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true;               // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true;                           // multicast + reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::" || lower === "::1") return true;

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible (::127.0.0.1) IPv6.
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // URL parsing rewrites [::ffff:127.0.0.1] as [::ffff:7f00:1], so the hex form has to be checked too.
  const hex = lower.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  // Unique local fc00::/7.
  if (/^f[cd]/.test(lower)) return true;
  // Link-local fe80::/10.
  if (/^fe[89ab]/.test(lower)) return true;
  // Site-local fec0::/10 and multicast ff00::/8.
  if (/^fe[c-f]/.test(lower) || /^ff/.test(lower)) return true;
  // Discard prefix 100::/64.
  if (/^100:/.test(lower)) return true;
  return false;
}

const MAX_REDIRECTS = 5;

/**
 * Fetches an untrusted URL. Every redirect hop is re-checked, because a public URL can redirect to
 * an internal address, and the body is read with a hard size cap, because Content-Length can lie.
 */
export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; timeoutMs: number; headers?: Record<string, string> },
): Promise<{ buffer: Buffer; contentType: string }> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeExternalUrlResolved(url))) throw new Error("disallowed url");
    const res = await fetch(url, { headers: opts.headers, signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next) throw new Error("redirect without a location");
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`upstream returned ${res.status}`);
    }
    if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) {
      await res.body?.cancel();
      throw new Error("response too large");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > opts.maxBytes) {
          await reader.cancel();
          throw new Error("response too large");
        }
        chunks.push(value);
      }
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
    };
  }
  throw new Error("too many redirects");
}
