import { Hono } from 'hono'
import { getAdapter } from '../lib/db.ts'
import { requireUser } from '../lib/requireUser.ts'
import { parseBody } from '../lib/parseBody.ts'
import {
  hostnameOf,
  newApplicationSchema,
  newPendingUrlsSchema,
  pendingPatchSchema,
} from '../lib/validation.ts'

const app = new Hono()

app.get('/', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const rows = await (await getAdapter()).listPendingUrls()
  return c.json(rows)
})

app.post('/', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const parsed = await parseBody(c, newPendingUrlsSchema)
  if (!parsed.ok) return parsed.response
  const stamped = parsed.data.map(p => ({
    ...p,
    hostname: hostnameOf(p.url),
    addedBy: auth.user.uid,
    addedByName: auth.user.displayName,
  }))
  const created = await (await getAdapter()).createPendingUrls(stamped)
  return c.json(created, 201)
})

app.patch('/:id', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const id = c.req.param('id')
  const parsed = await parseBody(c, pendingPatchSchema)
  if (!parsed.ok) return parsed.response
  const patch = parsed.data
  const final = patch.url !== undefined ? { ...patch, hostname: hostnameOf(patch.url) } : patch
  const adapter = await getAdapter()
  await adapter.updatePendingUrl(id, final)
  const all = await adapter.listPendingUrls()
  const updated = all.find(p => p.id === id)
  if (!updated) return c.json({ error: 'not_found' }, 404)
  return c.json(updated)
})

app.delete('/:id', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const id = c.req.param('id')
  await (await getAdapter()).deletePendingUrl(id)
  return c.body(null, 204)
})

app.post('/:id/approve', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const id = c.req.param('id')
  const parsed = await parseBody(c, newApplicationSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const application = {
    ...body,
    addedBy: auth.user.uid,
    addedByName: auth.user.displayName,
    appliedAt: body.appliedAt ?? (body.status === 'applied' ? Date.now() : null),
  }
  try {
    const created = await (await getAdapter()).approvePending(id, application)
    return c.json(created, 201)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('pending_not_found')) return c.json({ error: 'not_found' }, 404)
    console.error('[api/pending/approve] failed', e)
    return c.json({ error: 'approve_failed' }, 500)
  }
})

app.all('/', c => {
  c.header('Allow', 'GET, POST')
  return c.json({ error: 'method_not_allowed' }, 405)
})
app.all('/:id', c => {
  c.header('Allow', 'PATCH, DELETE')
  return c.json({ error: 'method_not_allowed' }, 405)
})
app.all('/:id/approve', c => {
  c.header('Allow', 'POST')
  return c.json({ error: 'method_not_allowed' }, 405)
})

export default app
