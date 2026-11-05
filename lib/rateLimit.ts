const store = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 5000;

// Prune expired entries every 10 minutes so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.resetAt) store.delete(k);
  }
}, 10 * 60 * 1000).unref();

/** Returns true if the request is allowed, false if the limit has been exceeded. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Prevent unbounded growth under floods of unique IPs.
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/** Whether a key is already at its limit, without counting this as another attempt. */
export function isRateLimited(key: string, limit: number): boolean {
  const entry = store.get(key);
  return !!entry && Date.now() <= entry.resetAt && entry.count >= limit;
}
