import crypto from "crypto";

// Verify a Werkzeug-format password hash against a plaintext password.
// Supports the two common formats produced by werkzeug.security.generate_password_hash:
//   pbkdf2:sha256:<iterations>$<salt>$<hex_digest>
//   scrypt:<N>:<r>:<p>$<salt>$<hex_digest>
// Returns true on match. On unknown/malformed input returns false.
export function verifyWerkzeugHash(stored: string, password: string): boolean {
  if (!stored || !password) return false;

  const [method, saltAndHash] = splitOnce(stored, "$");
  if (!saltAndHash) return false;

  const [salt, expectedHex] = splitOnce(saltAndHash, "$");
  if (!salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length === 0) return false;

  if (method.startsWith("pbkdf2:")) {
    const parts = method.split(":");
    const algo = parts[1] || "sha256";
    const iterations = parseInt(parts[2] || "260000", 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const got = crypto.pbkdf2Sync(password, salt, iterations, expected.length, algo);
    return timingSafeEq(got, expected);
  }

  if (method.startsWith("scrypt:")) {
    const parts = method.split(":");
    const N = parseInt(parts[1] || "32768", 10);
    const r = parseInt(parts[2] || "8", 10);
    const p = parseInt(parts[3] || "1", 10);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
    try {
      const got = crypto.scryptSync(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: 256 * N * r * 2,
      });
      return timingSafeEq(got, expected);
    } catch {
      return false;
    }
  }

  return false;
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  if (i < 0) return [s, ""];
  return [s.slice(0, i), s.slice(i + 1)];
}

function timingSafeEq(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
