import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { memoryAdapter } from '../lib/testHelpers'
import { _resetRateLimitForTests } from '../lib/rateLimit'
import type { DataAdapter } from '@/storage/adapter'

let adapter: DataAdapter
let session: { userId?: string } = {}

vi.mock('../lib/db.ts', () => ({
  getAdapter: async () => adapter,
}))

vi.mock('../lib/session.ts', () => ({
  getAppSession: async () => session,
  saveAppSession: async (_c: unknown, data: { userId?: string }) => {
    session = { ...data }
  },
  destroyAppSession: () => {
    session = {}
  },
}))

const authRoute = (await import('./auth')).default

function buildApp() {
  const app = new Hono()
  app.route('/api/auth', authRoute)
  return app
}

async function json(app: Hono, url: string, method: string, body?: unknown) {
  return app.request(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  adapter = memoryAdapter()
  session = {}
  _resetRateLimitForTests()
})

describe('GET /api/auth/me', () => {
  it('returns needs-setup when no users exist', async () => {
    const r = await buildApp().request('/api/auth/me')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'needs-setup', minPasswordLength: 1 })
  })

  it('returns signed-out when users exist but no session', async () => {
    await adapter.createUser({
      username: 'alpha',
      passwordHash: 'scrypt$x$y$z$AA==$BB==',
      role: 'admin',
    })
    const r = await buildApp().request('/api/auth/me')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'signed-out' })
  })

  it('returns signed-in when session matches a user', async () => {
    const u = await adapter.createUser({
      username: 'alpha',
      passwordHash: 'scrypt$x$y$z$AA==$BB==',
      role: 'admin',
    })
    session = { userId: u.id }
    const r = await buildApp().request('/api/auth/me')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      status: 'signed-in',
      user: { id: u.id, username: 'alpha', role: 'admin' },
    })
  })

  it('falls back to needs-setup when session userId references a deleted user and DB is empty', async () => {
    session = { userId: 'ghost' }
    const r = await buildApp().request('/api/auth/me')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'needs-setup', minPasswordLength: 1 })
  })
})

describe('POST /api/auth/setup', () => {
  it('creates the first admin and signs them in', async () => {
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'Alex',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { status: string; user: { username: string } }
    expect(body.status).toBe('signed-in')
    expect(body.user.username).toBe('alex')
    expect(session.userId).toBeDefined()
  })

  it('returns 410 once a user already exists', async () => {
    await adapter.createUser({
      username: 'alpha',
      passwordHash: 'scrypt$x$y$z$AA==$BB==',
      role: 'admin',
    })
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'alex',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(410)
    expect(await r.json()).toEqual({ error: 'setup_already_complete' })
  })

  it('accepts a short password when no minimum is configured', async () => {
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'alex',
      password: 'short',
    })
    expect(r.status).toBe(200)
  })

  it('rejects an empty password', async () => {
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'alex',
      password: '',
    })
    expect(r.status).toBe(400)
  })

  it('rejects passwords shorter than MIN_PASSWORD_LENGTH when set', async () => {
    process.env.MIN_PASSWORD_LENGTH = '16'
    try {
      const r = await json(buildApp(), '/api/auth/setup', 'POST', {
        username: 'alex',
        password: 'short',
      })
      expect(r.status).toBe(400)
    } finally {
      delete process.env.MIN_PASSWORD_LENGTH
    }
  })

  it('rejects malformed usernames', async () => {
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'bad name!',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(400)
  })

  it('returns 410 when adapter.createInitialUser detects a race', async () => {
    // Simulate: another request slipped in between the route's pre-check
    // and the atomic insert. The adapter throws and we should surface 410,
    // not a 500.
    const realCreate = adapter.createInitialUser.bind(adapter)
    adapter.createInitialUser = async input => {
      await adapter.createUser(input)
      return realCreate(input)
    }
    const r = await json(buildApp(), '/api/auth/setup', 'POST', {
      username: 'alex',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(410)
    expect(await r.json()).toEqual({ error: 'setup_already_complete' })
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const { createUser } = await import('../lib/users')
    await createUser({
      username: 'alex',
      password: 'correct-horse-battery-staple',
    })
  })

  it('signs in with valid credentials (case-insensitive username)', async () => {
    const r = await json(buildApp(), '/api/auth/login', 'POST', {
      username: 'Alex',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { status: string }
    expect(body.status).toBe('signed-in')
    expect(session.userId).toBeDefined()
  })

  it('returns 401 generic error on bad password', async () => {
    const r = await json(buildApp(), '/api/auth/login', 'POST', {
      username: 'alex',
      password: 'wrong-but-long-enough',
    })
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'invalid_credentials' })
    expect(session.userId).toBeUndefined()
  })

  it('returns 401 generic error on unknown username (no enumeration)', async () => {
    const r = await json(buildApp(), '/api/auth/login', 'POST', {
      username: 'nobody',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'invalid_credentials' })
  })

  it('rate-limits after repeated failures', async () => {
    const app = buildApp()
    for (let i = 0; i < 5; i++) {
      await json(app, '/api/auth/login', 'POST', {
        username: 'alex',
        password: 'wrong-but-long-enough',
      })
    }
    const r = await json(app, '/api/auth/login', 'POST', {
      username: 'alex',
      password: 'correct-horse-battery-staple',
    })
    expect(r.status).toBe(429)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session', async () => {
    session = { userId: 'someone' }
    const r = await buildApp().request('/api/auth/logout', { method: 'POST' })
    expect(r.status).toBe(204)
    expect(session.userId).toBeUndefined()
  })
})
