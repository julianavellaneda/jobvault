import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryAdapter, mockReq, mockRes } from './testHelpers'
import { _resetRateLimitForTests } from './rateLimit'
import type { DataAdapter } from '@/storage/adapter'
import type { StoredUser } from '@/auth/adapter'

let adapter: DataAdapter
let sessionUser: StoredUser | null = null

vi.mock('./db', () => ({
  getAdapter: () => adapter,
}))

// Handlers import `'../_lib/db.js'` (from api/applications/) and `'../../_lib/db.js'`
// (from api/pending/[id]/). Mock those resolved paths too.
vi.mock('../_lib/db.js', () => ({ getAdapter: () => adapter }))
vi.mock('../../_lib/db.js', () => ({ getAdapter: () => adapter }))

// requireUser imports `./session.js`. Stub readSessionUser so tests don't need
// to run real iron-session crypto (and don't need a SESSION_SECRET).
vi.mock('./session', () => ({
  readSessionUser: async () => sessionUser,
  getSession: async () => ({ user: sessionUser, save: async () => {}, destroy: () => {} }),
  getOAuthStateSession: async () => ({ state: undefined, save: async () => {}, destroy: () => {} }),
}))

// Defer imports so the mocks above are in place.
const appsIndex = (await import('../applications/index')).default
const appsId = (await import('../applications/[id]')).default
const pendingIndex = (await import('../pending/index')).default
const pendingId = (await import('../pending/[id]')).default
const pendingApprove = (await import('../pending/[id]/approve')).default

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
  delete process.env.VERCEL_ENV
  delete process.env.NODE_ENV
  delete process.env.ALLOWLIST
})

describe('auth shim', () => {
  it('rejects no-auth in production unless ALLOW_NO_AUTH=true', async () => {
    process.env.VERCEL_ENV = 'production'
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(503)
    expect(r.body).toEqual({ error: 'auth_not_configured' })
  })

  it('allows no-auth in production when ALLOW_NO_AUTH=true', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.ALLOW_NO_AUTH = 'true'
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(200)
  })

  it('AUTH_MODE=oauth with no session returns 401', async () => {
    process.env.AUTH_MODE = 'oauth'
    sessionUser = null
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(401)
    expect(r.body).toEqual({ error: 'unauthenticated' })
  })

  it('AUTH_MODE=oauth with session in env allowlist returns 200', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'jules@example.com,other@example.com'
    sessionUser = { uid: 'g-123', email: 'jules@example.com', displayName: 'Jules' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(200)
  })

  it('AUTH_MODE=oauth with session not in env allowlist returns 403', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'someone@else.com'
    sessionUser = { uid: 'g-123', email: 'jules@example.com', displayName: 'Jules' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(403)
    expect(r.body).toEqual({ error: 'not_allowed' })
  })

  it('AUTH_MODE=oauth with empty ALLOWLIST allows any signed-in user', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = ''
    sessionUser = { uid: 'g-123', email: 'someone@anywhere.com', displayName: 'Someone' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(200)
  })

  it('AUTH_MODE=oauth allowlist is case-insensitive', async () => {
    process.env.AUTH_MODE = 'oauth'
    process.env.ALLOWLIST = 'Jules@Example.com'
    sessionUser = { uid: 'g-123', email: 'jules@example.COM', displayName: 'Jules' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(200)
  })

  it('AUTH_MODE=oauth falls back to SQL allowlist when ALLOWLIST env unset', async () => {
    process.env.AUTH_MODE = 'oauth'
    adapter = memoryAdapter({ allowedEmails: ['jules@example.com'] })
    sessionUser = { uid: 'g-123', email: 'jules@example.com', displayName: 'Jules' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(200)
  })

  it('AUTH_MODE=oauth SQL allowlist denies non-matching email', async () => {
    process.env.AUTH_MODE = 'oauth'
    adapter = memoryAdapter({ allowedEmails: ['someone@else.com'] })
    sessionUser = { uid: 'g-123', email: 'jules@example.com', displayName: 'Jules' }
    const r = mockRes()
    await appsIndex(mockReq({ method: 'GET' }), r.res)
    expect(r.statusCode).toBe(403)
  })
})

describe('POST /api/applications', () => {
  it('400s on invalid body', async () => {
    const r = mockRes()
    await appsIndex(mockReq({ method: 'POST', body: { bogus: 1 } }), r.res)
    expect(r.statusCode).toBe(400)
  })

  it('400s on non-http URL scheme', async () => {
    const r = mockRes()
    await appsIndex(
      mockReq({ method: 'POST', body: { url: 'javascript:alert(1)' } }),
      r.res,
    )
    expect(r.statusCode).toBe(400)
  })

  it('creates with server-stamped addedBy/addedByName', async () => {
    const r = mockRes()
    await appsIndex(
      mockReq({
        method: 'POST',
        body: { url: 'https://example.com/x', addedBy: 'attacker', addedByName: 'spoof' },
      }),
      r.res,
    )
    expect(r.statusCode).toBe(201)
    const body = r.body as { addedBy: string; addedByName: string }
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
    const r = mockRes()
    await appsId(
      mockReq({ method: 'PATCH', body: { status: 'applied' }, query: { id: created.id } }),
      r.res,
    )
    expect(r.statusCode).toBe(200)
    const body = r.body as { appliedAt: number | null }
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
    const r = mockRes()
    await appsId(
      mockReq({ method: 'PATCH', body: { status: 'applied' }, query: { id: created.id } }),
      r.res,
    )
    const body = r.body as { appliedAt: number | null }
    expect(body.appliedAt).toBe(1000)
  })

  it('404s on missing row', async () => {
    const r = mockRes()
    await appsId(
      mockReq({ method: 'PATCH', body: { notes: 'x' }, query: { id: 'missing' } }),
      r.res,
    )
    expect(r.statusCode).toBe(404)
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
    const r = mockRes()
    await appsId(mockReq({ method: 'DELETE', query: { id: created.id } }), r.res)
    expect(r.statusCode).toBe(204)
    expect(await adapter.getApplication(created.id)).toBeNull()
  })
})

describe('method not allowed', () => {
  it('PATCH on /api/applications collection returns 405', async () => {
    const r = mockRes()
    await appsIndex(mockReq({ method: 'PATCH', body: {} }), r.res)
    expect(r.statusCode).toBe(405)
    expect(r.headers['Allow']).toContain('GET')
  })
})

describe('pending handlers', () => {
  it('POST /api/pending derives hostname server-side and ignores client-sent value', async () => {
    const r = mockRes()
    await pendingIndex(
      mockReq({
        method: 'POST',
        body: [
          {
            url: 'https://www.example.com/job',
            extracted: EMPTY_EXTRACTED,
          },
        ],
      }),
      r.res,
    )
    expect(r.statusCode).toBe(201)
    const body = r.body as Array<{ hostname: string; addedBy: string }>
    expect(body[0].hostname).toBe('example.com')
    expect(body[0].addedBy).toBe('local')
  })

  it('POST /api/pending rejects non-http URL', async () => {
    const r = mockRes()
    await pendingIndex(
      mockReq({
        method: 'POST',
        body: [{ url: 'file:///etc/passwd', extracted: EMPTY_EXTRACTED }],
      }),
      r.res,
    )
    expect(r.statusCode).toBe(400)
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
    const r = mockRes()
    await pendingId(
      mockReq({
        method: 'PATCH',
        body: { url: 'https://www.new.example.com/y' },
        query: { id: p.id },
      }),
      r.res,
    )
    expect(r.statusCode).toBe(200)
    const body = r.body as { hostname: string; url: string }
    expect(body.hostname).toBe('new.example.com')
  })

  it('approve 404s when pending row missing', async () => {
    const r = mockRes()
    await pendingApprove(
      mockReq({
        method: 'POST',
        body: { url: 'https://example.com/x' },
        query: { id: 'missing' },
      }),
      r.res,
    )
    expect(r.statusCode).toBe(404)
    expect(r.body).toEqual({ error: 'not_found' })
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
    const r = mockRes()
    await pendingApprove(
      mockReq({
        method: 'POST',
        body: { url: 'https://example.com/job', status: 'applied' },
        query: { id: p.id },
      }),
      r.res,
    )
    expect(r.statusCode).toBe(201)
    const body = r.body as { appliedAt: number | null; status: string }
    expect(body.status).toBe('applied')
    expect(typeof body.appliedAt).toBe('number')
    expect(await adapter.listPendingUrls()).toEqual([])
  })
})
