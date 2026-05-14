import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getOAuthStateSession } from '../_lib/session.js'
import { buildAuthorizeUrl, redirectUriFor } from '../_lib/oauthGoogle.js'
import { rateLimit } from '../_lib/rateLimit.js'
import { methodNotAllowed } from '../_lib/http.js'

function clientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff[0] : xff
  if (raw) return String(raw).split(',')[0].trim()
  return 'anon'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((process.env.AUTH_MODE || 'none').toLowerCase() !== 'oauth') {
    res.status(404).json({ error: 'oauth_not_enabled' })
    return
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }
  const limit = rateLimit(`login:${clientIp(req)}`)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
    return
  }

  const state = crypto.randomUUID()
  const redirectUri = redirectUriFor(req)

  try {
    const stateSession = await getOAuthStateSession(req, res)
    stateSession.state = state
    await stateSession.save()
    res.setHeader('Location', buildAuthorizeUrl(state, redirectUri))
    res.status(302).end()
  } catch (e) {
    console.error('login_error', e)
    res.status(500).json({ error: 'login_misconfigured' })
  }
}
