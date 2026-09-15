import type { Context } from 'hono'
import type { GetConnInfo } from 'hono/conninfo'

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
}

let getConnInfo: GetConnInfo | null = null

async function loadGetConnInfo(): Promise<GetConnInfo> {
  if (!getConnInfo) {
    getConnInfo = isBunRuntime()
      ? (await import('hono/bun')).getConnInfo
      : (await import('@hono/node-server/conninfo')).getConnInfo
  }
  return getConnInfo
}

/**
 * The caller's IP, for rate limiting.
 *
 * `X-Forwarded-For` is written by the client unless a reverse proxy overwrites
 * it, so it's only honoured with TRUST_PROXY=true — and then only the rightmost
 * hop, which is the one the (single) trusted proxy appended. Otherwise the
 * socket's remote address is used.
 */
export async function clientIp(c: Context): Promise<string> {
  if (process.env.TRUST_PROXY === 'true') {
    const hops = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map(h => h.trim())
      .filter(Boolean)
    const nearest = hops.at(-1)
    if (nearest) return nearest
  }
  try {
    return (await loadGetConnInfo())(c).remote.address ?? 'unknown'
  } catch {
    // No socket bindings (e.g. app.request() in tests).
    return 'unknown'
  }
}
