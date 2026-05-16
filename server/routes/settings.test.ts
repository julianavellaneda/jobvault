import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { memoryAdapter } from '../lib/testHelpers'
import { _resetRateLimitForTests } from '../lib/rateLimit'
import type { DataAdapter } from '@/storage/adapter'

let adapter: DataAdapter
let genText: (args: unknown) => Promise<{ text: string }>

vi.mock('../lib/db.ts', () => ({
  getAdapter: async () => adapter,
}))

vi.mock('../lib/session.ts', () => ({
  readSessionUser: async () => null,
  getAppSession: async () => ({ user: null }),
}))

vi.mock('ai', () => ({
  generateText: (args: unknown) => genText(args),
}))

const settingsRoute = (await import('./settings')).default

function buildApp() {
  const app = new Hono()
  app.route('/api/settings', settingsRoute)
  return app
}

async function jsonReq(app: Hono, url: string, method: string, body?: unknown) {
  return app.request(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  adapter = memoryAdapter()
  genText = async () => ({ text: 'OK' })
  _resetRateLimitForTests()
  delete process.env.AUTH_MODE
  delete process.env.AI_PROVIDER
  delete process.env.AI_MODEL
  delete process.env.AI_BASE_URL
  delete process.env.OPENAI_API_KEY
  delete process.env.MINIMAX_API_KEY
})

describe('GET /api/settings/ai', () => {
  it('reports source "none" with the full provider list when unconfigured', async () => {
    const r = await buildApp().request('/api/settings/ai')
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('none')
    expect(body.ready).toBe(false)
    expect(body.effective.hasKey).toBe(false)
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual([
      'openai',
      'anthropic',
      'google',
      'minimax',
      'openrouter',
      'openai-compatible',
    ])
  })

  it('env wins and the raw key is never returned', async () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'sk-secret-key-9876'
    const r = await buildApp().request('/api/settings/ai')
    const body = await r.json()
    expect(body.source).toBe('env')
    expect(body.ready).toBe(true)
    expect(body.effective.provider).toBe('openai')
    expect(body.effective.hasKey).toBe(true)
    expect(body.effective.keyPreview).toBe('••••9876')
    expect(JSON.stringify(body)).not.toContain('sk-secret-key-9876')
  })

  it('legacy MINIMAX_API_KEY with no AI_PROVIDER stays working (back-compat)', async () => {
    process.env.MINIMAX_API_KEY = 'mm-legacy-0000'
    const body = await (await buildApp().request('/api/settings/ai')).json()
    expect(body.source).toBe('env')
    expect(body.effective.provider).toBe('minimax')
  })

  it('falls back to the saved DB row when no env is set', async () => {
    await adapter.setAiSettings({ provider: 'anthropic', apiKey: 'k-abcd', model: 'claude' })
    const body = await (await buildApp().request('/api/settings/ai')).json()
    expect(body.source).toBe('db')
    expect(body.effective.provider).toBe('anthropic')
    expect(body.effective.keyPreview).toBe('••••abcd')
    expect(JSON.stringify(body)).not.toContain('k-abcd')
  })
})

describe('PATCH /api/settings/ai', () => {
  it('persists settings and rejects unknown providers', async () => {
    const app = buildApp()
    const ok = await jsonReq(app, '/api/settings/ai', 'PATCH', {
      provider: 'google',
      apiKey: 'g-key',
    })
    expect(ok.status).toBe(204)
    expect(await adapter.getAiSettings()).toMatchObject({ provider: 'google', apiKey: 'g-key' })

    const bad = await jsonReq(app, '/api/settings/ai', 'PATCH', { provider: 'nope' })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('invalid_body')
  })
})

describe('POST /api/settings/ai/test', () => {
  it('returns ok when the model responds', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai',
      apiKey: 'sk-live',
    })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, sample: 'OK' })
  })

  it('fails fast when a required key is missing', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', { provider: 'openai' })
    expect(await r.json()).toEqual({ ok: false, error: 'missing_api_key' })
  })

  it('surfaces provider errors as ok:false', async () => {
    genText = async () => {
      throw new Error('401 invalid api key')
    }
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai',
      apiKey: 'sk-bad',
    })
    expect(await r.json()).toEqual({ ok: false, error: '401 invalid api key' })
  })
})

describe('method not allowed', () => {
  it('405s on unsupported verbs', async () => {
    const r = await buildApp().request('/api/settings/ai', { method: 'DELETE' })
    expect(r.status).toBe(405)
    expect(r.headers.get('Allow')).toBe('GET, PATCH')
  })
})
