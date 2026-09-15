type Bucket = { count: number; windowStart: number; windowMs: number }

const DEFAULT_LIMIT = 20
const DEFAULT_WINDOW_MS = 5 * 60 * 1000
// Upper bound on tracked keys. Keys are derived from client IPs and usernames,
// so without a cap an attacker rotating either could grow the map unbounded.
const MAX_KEYS = 10_000

const store = new Map<string, Bucket>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

function liveBucket(key: string, now: number): Bucket | null {
  const bucket = store.get(key)
  if (!bucket) return null
  if (now - bucket.windowStart >= bucket.windowMs) {
    store.delete(key)
    return null
  }
  return bucket
}

function prune(now: number): void {
  if (store.size < MAX_KEYS) return
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart >= bucket.windowMs) store.delete(key)
  }
  // Still full of live buckets: evict oldest-inserted first (Map keeps
  // insertion order).
  for (const key of store.keys()) {
    if (store.size < MAX_KEYS) break
    store.delete(key)
  }
}

/** Check a key against its limit without counting this call as a hit. */
export function checkRateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now()
  const bucket = liveBucket(key, now)
  if (!bucket || bucket.count < limit) return { ok: true }
  const retryAfterSec = Math.ceil((bucket.windowStart + windowMs - now) / 1000)
  return { ok: false, retryAfterSec: Math.max(retryAfterSec, 1) }
}

/** Count one hit against a key (e.g. a failed login). */
export function recordRateLimitHit(key: string, windowMs: number = DEFAULT_WINDOW_MS): void {
  const now = Date.now()
  const bucket = liveBucket(key, now)
  if (bucket) {
    bucket.count += 1
    return
  }
  prune(now)
  store.set(key, { count: 1, windowStart: now, windowMs })
}

/** Check and, if allowed, count the call. */
export function rateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const result = checkRateLimit(key, limit, windowMs)
  if (!result.ok) return result
  recordRateLimitHit(key, windowMs)
  return result
}

export function _resetRateLimitForTests() {
  store.clear()
}

export function _rateLimitSizeForTests(): number {
  return store.size
}
