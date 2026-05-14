import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdapter } from '../../_lib/db.js'
import { requireUser } from '../../_lib/requireUser.js'
import { rateLimit } from '../../_lib/rateLimit.js'
import { methodNotAllowed, parseBody, pathParam } from '../../_lib/http.js'
import { newApplicationSchema } from '../../_lib/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req, res)
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }

  const id = pathParam(req, 'id')
  if (!id) {
    res.status(400).json({ error: 'missing_id' })
    return
  }

  const limit = rateLimit(auth.user.email)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
    return
  }

  const body = parseBody(req, res, newApplicationSchema)
  if (!body) return

  const application = {
    ...body,
    addedBy: auth.user.uid,
    addedByName: auth.user.displayName,
    appliedAt: body.appliedAt ?? (body.status === 'applied' ? Date.now() : null),
  }

  try {
    const created = await getAdapter().approvePending(id, application)
    res.status(201).json(created)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('pending_not_found')) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    console.error('[api/pending/approve] failed', e)
    res.status(500).json({ error: 'approve_failed' })
  }
}
