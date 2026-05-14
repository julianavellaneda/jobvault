import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdapter } from '../_lib/db.js'
import { requireUser } from '../_lib/requireUser.js'
import { rateLimit } from '../_lib/rateLimit.js'
import { methodNotAllowed, parseBody, pathParam } from '../_lib/http.js'
import { applicationPatchSchema } from '../_lib/validation.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireUser(req, res)
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const id = pathParam(req, 'id')
  if (!id) {
    res.status(400).json({ error: 'missing_id' })
    return
  }

  const adapter = getAdapter()

  if (req.method === 'PATCH') {
    const limit = rateLimit(auth.user.email)
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfterSec))
      res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
      return
    }
    const patch = parseBody(req, res, applicationPatchSchema)
    if (!patch) return

    const current = await adapter.getApplication(id)
    if (!current) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const final = { ...patch }
    if (patch.status === 'applied' && patch.appliedAt === undefined && current.appliedAt == null) {
      final.appliedAt = Date.now()
    }

    await adapter.updateApplication(id, final)
    const updated = await adapter.getApplication(id)
    res.status(200).json(updated)
    return
  }

  if (req.method === 'DELETE') {
    const limit = rateLimit(auth.user.email)
    if (!limit.ok) {
      res.setHeader('Retry-After', String(limit.retryAfterSec))
      res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
      return
    }
    await adapter.deleteApplication(id)
    res.status(204).end()
    return
  }

  methodNotAllowed(res, ['PATCH', 'DELETE'])
}
