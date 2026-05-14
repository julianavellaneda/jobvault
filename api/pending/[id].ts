import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdapter } from '../_lib/db.js'
import { requireUser } from '../_lib/requireUser.js'
import { rateLimit } from '../_lib/rateLimit.js'
import { methodNotAllowed, parseBody, pathParam } from '../_lib/http.js'
import { pendingPatchSchema, hostnameOf } from '../_lib/validation.js'

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
    const patch = parseBody(req, res, pendingPatchSchema)
    if (!patch) return
    const final = patch.url !== undefined ? { ...patch, hostname: hostnameOf(patch.url) } : patch
    await adapter.updatePendingUrl(id, final)
    const all = await adapter.listPendingUrls()
    const updated = all.find(p => p.id === id)
    if (!updated) {
      res.status(404).json({ error: 'not_found' })
      return
    }
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
    await adapter.deletePendingUrl(id)
    res.status(204).end()
    return
  }

  methodNotAllowed(res, ['PATCH', 'DELETE'])
}
