import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdapter } from '../_lib/db.js'
import { requireUser } from '../_lib/requireUser.js'
import { rateLimit } from '../_lib/rateLimit.js'
import { methodNotAllowed, parseBody } from '../_lib/http.js'
import { newApplicationSchema } from '../_lib/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req, res)
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  if (req.method === 'GET') {
    const apps = await getAdapter().listApplications()
    res.status(200).json(apps)
    return
  }

  if (req.method === 'POST') {
    const limit = rateLimit(auth.user.email)
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfterSec))
      res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
      return
    }
    const body = parseBody(req, res, newApplicationSchema)
    if (!body) return
    const created = await getAdapter().createApplication({
      ...body,
      addedBy: auth.user.uid,
      addedByName: auth.user.displayName,
    })
    res.status(201).json(created)
    return
  }

  methodNotAllowed(res, ['GET', 'POST'])
}
