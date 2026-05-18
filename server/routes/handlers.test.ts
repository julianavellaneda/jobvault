import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { memoryAdapter } from '../lib/testHelpers'
import { _resetRateLimitForTests } from '../lib/rateLimit'
import { MAX_PENDING_BATCH } from '../lib/validation'
import type { DataAdapter } from '@/storage/adapter'
import type { StoredUser } from '@/auth/adapter'

let adapter: DataAdapter
let sessionUser: StoredUser | null = null

vi.mock('../lib/db.ts', () => ({
  getAdapter: async () => adapter,
}))

vi.mock('../lib/session.ts', () => ({
  readSessionUser: async () => sessionUser,
  getAppSession: async () => ({ user: sessionUser }),
  saveAppSession: async () => {},
  destroyAppSession: () => {},
  getOAuthStateSession: async () => ({}),
  saveOAuthStateSession: async () => {},
  destroyOAuthStateSession: () => {},
}))

const applicationsRoute = (await import('./applications')).default
const pendingRoute = (await import('./pending')).default

function buildApp() {
  const app = new Hono()
  app.route('/api/applications', applicationsRoute)
  app.route('/api/pending', pendingRoute)
  return app
}

const EMPTY_EXTRACTED = {
  company: '',
  role: '',
  salary: '',
  location: '',
  workArrangement: '' as const,
  source: '',
}

beforeEach(() => {
  adapter = memoryAdapter()
  sessionUser = null
  _resetRateLimitForTests()
  delete process.env.AUTH_MODE
  delete process.env.ALLOW_NO_AUTH
  delete process.env.NODE_ENV
  delete process.env.ALLOWLIST
})

async function jsonReq(app: Hono, url: string, method: string, body?: unknown) {
  return app.request(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('auth shim', () => {
  it('rejects no-auth in production unless ALLOW_NO_AUTH=true', async () => {
    process.env.NODE_ENV = 'production'
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'auth_not_configured' })
  })

  it('allows no-auth in production when ALLOW_NO_AUTH=true', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_NO_AUTH = 'true'
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(200)
  })

  it('AUTH_MODE=oauth with no session returns 401', async () => {
    process.env.AUTH_MODE = 'oauth'
    sessionUser = null
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'unauthenticated' })
  })

  it('AUTH_MODE=oauth with session in env allowlist returns 200', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'user@example.com,other@example.com'
    sessionUser = { uid: 'g-123', email: 'user@example.com', displayName: 'User' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(200)
  })

  it('AUTH_MODE=oauth with session not in env allowlist returns 403', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'someone@else.com'
    sessionUser = { uid: 'g-123', email: 'user@example.com', displayName: 'User' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'not_allowed' })
  })

  it('AUTH_MODE=oauth with empty ALLOWLIST allows any signed-in user', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = ''
    sessionUser = { uid: 'g-123', email: 'someone@anywhere.com', displayName: 'Someone' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(200)
  })

  it('AUTH_MODE=oauth allowlist is case-insensitive', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'User@Example.com'
    sessionUser = { uid: 'g-123', email: 'user@example.COM', displayName: 'User' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(200)
  })

  it('AUTH_MODE=oauth falls back to SQL allowlist when ALLOWLIST env unset', async () => {
    process.env.AUTH_MODE = 'oauth'
    adapter = memoryAdapter({ allowedEmails: ['user@example.com'] })
    sessionUser = { uid: 'g-123', email: 'user@example.com', displayName: 'User' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(200)
  })

  it('AUTH_MODE=oauth SQL allowlist denies non-matching email', async () => {
    process.env.AUTH_MODE = 'oauth'
    adapter = memoryAdapter({ allowedEmails: ['someone@else.com'] })
    sessionUser = { uid: 'g-123', email: 'user@example.com', displayName: 'User' }
    const r = await buildApp().request('/api/applications')
    expect(r.status).toBe(403)
  })
})

describe('POST /api/applications', () => {
  it('400s on invalid body', async () => {
    const r = await jsonReq(buildApp(), '/api/applications', 'POST', { bogus: 1 })
    expect(r.status).toBe(400)
  })

  it('400s on non-http URL scheme', async () => {
    const r = await jsonReq(buildApp(), '/api/applications', 'POST', { url: 'javascript:alert(1)' })
    expect(r.status).toBe(400)
  })

  it('creates with server-stamped addedBy/addedByName', async () => {
    const r = await jsonReq(buildApp(), '/api/applications', 'POST', {
      url: 'https://example.com/x',
      addedBy: 'attacker',
      addedByName: 'spoof',
    })
    expect(r.status).toBe(201)
    const body = (await r.json()) as { addedBy: string; addedByName: string }
    expect(body.addedBy).toBe('local')
    expect(body.addedByName).toBe('Local User')
  })
})

describe('PATCH /api/applications/[id]', () => {
  it('auto-stamps appliedAt when status flips to applied', async () => {
    const created = await adapter.createApplication({
      url: 'https://example.com/x',
      company: '',
      role: '',
      salary: '',
      location: '',
      workArrangement: '',
      source: '',
      tags: [],
      status: 'pending',
      notes: '',
      deadline: null,
      followUpDate: null,
      appliedAt: null,
      addedBy: 'local',
      addedByName: 'Local',
    })
    const r = await jsonReq(buildApp(), `/api/applications/${created.id}`, 'PATCH', { status: 'applied' })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { appliedAt: number | null }
    expect(typeof body.appliedAt).toBe('number')
  })

  it('does not overwrite an existing appliedAt', async () => {
    const created = await adapter.createApplication({
      url: 'https://example.com/x',
      company: '',
      role: '',
      salary: '',
      location: '',
      workArrangement: '',
      source: '',
      tags: [],
      status: 'pending',
      notes: '',
      deadline: null,
      followUpDate: null,
      appliedAt: 1000,
      addedBy: 'local',
      addedByName: 'Local',
    })
    const r = await jsonReq(buildApp(), `/api/applications/${created.id}`, 'PATCH', { status: 'applied' })
    const body = (await r.json()) as { appliedAt: number | null }
    expect(body.appliedAt).toBe(1000)
  })

  it('404s on missing row', async () => {
    const r = await jsonReq(buildApp(), '/api/applications/missing', 'PATCH', { notes: 'x' })
    expect(r.status).toBe(404)
  })
})

describe('DELETE /api/applications/[id]', () => {
  it('returns 204', async () => {
    const created = await adapter.createApplication({
      url: 'https://example.com/x',
      company: '',
      role: '',
      salary: '',
      location: '',
      workArrangement: '',
      source: '',
      tags: [],
      status: 'pending',
      notes: '',
      deadline: null,
      followUpDate: null,
      appliedAt: null,
      addedBy: 'local',
      addedByName: 'Local',
    })
    const r = await buildApp().request(`/api/applications/${created.id}`, { method: 'DELETE' })
    expect(r.status).toBe(204)
    expect(await adapter.getApplication(created.id)).toBeNull()
  })
})

describe('method not allowed', () => {
  it('PATCH on /api/applications collection returns 405', async () => {
    const r = await jsonReq(buildApp(), '/api/applications', 'PATCH', {})
    expect(r.status).toBe(405)
    expect(r.headers.get('Allow')).toContain('GET')
  })
})

describe('pending handlers', () => {
  it('POST /api/pending derives hostname server-side and ignores client-sent value', async () => {
    const r = await jsonReq(buildApp(), '/api/pending', 'POST', [
      { url: 'https://www.example.com/job', extracted: EMPTY_EXTRACTED },
    ])
    expect(r.status).toBe(201)
    const body = (await r.json()) as Array<{ hostname: string; addedBy: string }>
    expect(body[0].hostname).toBe('example.com')
    expect(body[0].addedBy).toBe('local')
  })

  it('POST /api/pending rejects non-http URL', async () => {
    const r = await jsonReq(buildApp(), '/api/pending', 'POST', [
      { url: 'file:///etc/passwd', extracted: EMPTY_EXTRACTED },
    ])
    expect(r.status).toBe(400)
  })

  it('POST /api/pending rejects oversized batches', async () => {
    const r = await jsonReq(
      buildApp(),
      '/api/pending',
      'POST',
      Array.from({ length: MAX_PENDING_BATCH + 1 }, (_, i) => ({
        url: `https://example.com/job-${i}`,
        extracted: EMPTY_EXTRACTED,
      })),
    )
    expect(r.status).toBe(400)
  })

  it('PATCH /api/pending/[id] re-derives hostname when url changes', async () => {
    const [p] = await adapter.createPendingUrls([
      {
        url: 'https://old.example.com/x',
        hostname: 'old.example.com',
        extraction: 'idle',
        extracted: EMPTY_EXTRACTED,
        extractError: '',
        addedBy: 'local',
        addedByName: 'Local',
      },
    ])
    const r = await jsonReq(buildApp(), `/api/pending/${p.id}`, 'PATCH', {
      url: 'https://www.new.example.com/y',
    })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { hostname: string; url: string }
    expect(body.hostname).toBe('new.example.com')
  })

  it('approve 404s when pending row missing', async () => {
    const r = await jsonReq(buildApp(), '/api/pending/missing/approve', 'POST', {
      url: 'https://example.com/x',
    })
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'not_found' })
  })

  it('approve atomically deletes pending and creates application with appliedAt stamp', async () => {
    const [p] = await adapter.createPendingUrls([
      {
        url: 'https://example.com/job',
        hostname: 'example.com',
        extraction: 'done',
        extracted: EMPTY_EXTRACTED,
        extractError: '',
        addedBy: 'local',
        addedByName: 'Local',
      },
    ])
    const r = await jsonReq(buildApp(), `/api/pending/${p.id}/approve`, 'POST', {
      url: 'https://example.com/job',
      status: 'applied',
    })
    expect(r.status).toBe(201)
    const body = (await r.json()) as { appliedAt: number | null; status: string }
    expect(body.status).toBe('applied')
    expect(typeof body.appliedAt).toBe('number')
    expect(await adapter.listPendingUrls()).toEqual([])
  })
})
