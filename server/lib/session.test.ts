import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { sealData } from 'iron-session'
import { memoryAdapter } from './testHelpers'
import type { DataAdapter } from '@/storage/adapter'

let adapter: DataAdapter

vi.mock('./db.ts', () => ({
  getAdapter: async () => adapter,
}))

const { destroyAppSession, getAppSession, saveAppSession } = await import('./session')

const SECRET = 'x'.repeat(40)

function buildApp() {
  const app = new Hono()
  app.post('/login/:userId', async c => {
    await saveAppSession(c, { userId: c.req.param('userId') })
    return c.body(null, 204)
  })
  app.get('/me', async c => c.json(await getAppSession(c)))
  app.post('/logout', async c => {
    await destroyAppSession(c)
    return c.body(null, 204)
  })
  return app
}

function cookieFrom(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  return header.split(';')[0]
}

beforeEach(() => {
  adapter = memoryAdapter()
  process.env.SESSION_SECRET = SECRET
})

afterEach(() => {
  delete process.env.SESSION_SECRET
  delete process.env.NODE_ENV
  delete process.env.COOKIE_SECURE
})

describe('server-side sessions', () => {
  it('round-trips a session through the cookie', async () => {
    const app = buildApp()
    const cookie = cookieFrom(await app.request('/login/u-1', { method: 'POST' }))
    const me = await app.request('/me', { headers: { cookie } })
    expect(await me.json()).toEqual({ userId: 'u-1' })
  })

  it('logout revokes the session even if the old cookie is replayed', async () => {
    const app = buildApp()
    const cookie = cookieFrom(await app.request('/login/u-1', { method: 'POST' }))
    await app.request('/logout', { method: 'POST', headers: { cookie } })

    const replay = await app.request('/me', { headers: { cookie } })
    expect(await replay.json()).toEqual({})
  })

  it('signing in again replaces the previous session', async () => {
    const app = buildApp()
    const first = cookieFrom(await app.request('/login/u-1', { method: 'POST' }))
    const second = cookieFrom(
      await app.request('/login/u-1', { method: 'POST', headers: { cookie: first } }),
    )
    expect(await (await app.request('/me', { headers: { cookie: first } })).json()).toEqual({})
    expect(await (await app.request('/me', { headers: { cookie: second } })).json()).toEqual({
      userId: 'u-1',
    })
  })

  it('rejects a validly sealed cookie with no session id (pre-0.6 format)', async () => {
    const legacy = await sealData({ userId: 'u-1' }, { password: SECRET, ttl: 60 })
    const me = await buildApp().request('/me', { headers: { cookie: `app_session=${legacy}` } })
    expect(await me.json()).toEqual({})
  })

  it('rejects an expired session row', async () => {
    const app = buildApp()
    const cookie = cookieFrom(await app.request('/login/u-1', { method: 'POST' }))
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000)
    try {
      const me = await app.request('/me', { headers: { cookie } })
      expect(await me.json()).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a session id sealed for a different user', async () => {
    const row = await adapter.createSession({ userId: 'u-1', expiresAt: Date.now() + 60_000 })
    const forged = await sealData({ userId: 'u-2', sid: row.id }, { password: SECRET, ttl: 60 })
    const me = await buildApp().request('/me', { headers: { cookie: `app_session=${forged}` } })
    expect(await me.json()).toEqual({})
  })
})

describe('cookie Secure flag', () => {
  it('is set in production by default', async () => {
    process.env.NODE_ENV = 'production'
    const res = await buildApp().request('/login/u-1', { method: 'POST' })
    expect(res.headers.get('set-cookie')).toMatch(/;\s*Secure/i)
  })

  it('can be turned off with COOKIE_SECURE=false for plain-HTTP LAN installs', async () => {
    process.env.NODE_ENV = 'production'
    process.env.COOKIE_SECURE = 'false'
    const res = await buildApp().request('/login/u-1', { method: 'POST' })
    expect(res.headers.get('set-cookie')).not.toMatch(/;\s*Secure/i)
  })
})
