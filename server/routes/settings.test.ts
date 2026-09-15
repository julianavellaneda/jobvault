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
  getAppSession: async () => ({ userId: 'u-1' }),
  saveAppSession: async () => {},
  destroyAppSession: () => {},
}))

vi.mock('../lib/users.ts', () => ({
  countUsers: async () => 1,
  findUserById: async (id: string) =>
    id === 'u-1'
      ? {
          id: 'u-1',
          username: 'tester',
          passwordHash: 'scrypt$x$y$z$AA==$BB==',
          role: 'admin' as const,
          createdAt: 0,
        }
      : null,
  findUserByUsername: async () => null,
  createUser: async () => {
    throw new Error('not used')
  },
  verifyUserPassword: async () => null,
}))

vi.mock('ai', () => ({
  generateText: (args: unknown) => genText(args),
}))

// Capture what each provider factory is handed, so tests can assert which key
// and base URL would actually go over the wire.
let factoryArgs: Record<string, unknown> | null = null
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (opts: Record<string, unknown>) => {
    factoryArgs = opts
    return () => ({})
  },
}))
vi.mock('vercel-minimax-ai-provider', () => ({
  createMinimax: (opts: Record<string, unknown>) => {
    factoryArgs = opts
    return () => ({})
  },
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
  factoryArgs = null
  _resetRateLimitForTests()
  delete process.env.AI_PROVIDER
  delete process.env.AI_MODEL
  delete process.env.AI_BASE_URL
  delete process.env.OPENAI_API_KEY
  delete process.env.MINIMAX_API_KEY
  delete process.env.MINIMAX_BASE_URL
})

describe('stored AI keys stay bound to their endpoint', () => {
  const LOCAL = 'http://127.0.0.1:11434/v1'

  beforeEach(async () => {
    await adapter.setAiSettings({
      provider: 'openai-compatible',
      apiKey: 'sk-stored-secret',
      baseUrl: LOCAL,
      model: 'llama3.1',
    })
  })

  it('/ai/test does not send the stored key to a request-supplied base URL', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: 'https://attacker.example/v1',
    })
    expect(r.status).toBe(200)
    expect(factoryArgs).toMatchObject({ baseURL: 'https://attacker.example/v1' })
    expect(factoryArgs).not.toHaveProperty('apiKey')
  })

  it('/ai/test reuses the stored key against the saved base URL', async () => {
    await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: LOCAL,
    })
    expect(factoryArgs).toMatchObject({ baseURL: LOCAL, apiKey: 'sk-stored-secret' })
  })

  it('PATCH clears the stored key when the base URL changes without a new key', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai-compatible',
      baseUrl: 'https://attacker.example/v1',
    })
    expect(r.status).toBe(204)
    expect(await adapter.getAiSettings()).toMatchObject({
      baseUrl: 'https://attacker.example/v1',
      apiKey: '',
    })
  })

  it('PATCH keeps the stored key when only the model changes', async () => {
    await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai-compatible',
      baseUrl: LOCAL,
      model: 'qwen2.5',
    })
    expect(await adapter.getAiSettings()).toMatchObject({ apiKey: 'sk-stored-secret', model: 'qwen2.5' })
  })

  it('PATCH clears the stored key on a provider switch without a new key', async () => {
    await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', { provider: 'openai' })
    expect(await adapter.getAiSettings()).toMatchObject({ provider: 'openai', apiKey: '' })
  })
})

describe('hosted providers ignore a browser-supplied base URL', () => {
  it('an env-configured MiniMax key is never sent to a request baseUrl', async () => {
    process.env.AI_PROVIDER = 'minimax'
    process.env.MINIMAX_API_KEY = 'mm-env-secret'
    await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'minimax',
      baseUrl: 'https://attacker.example',
    })
    expect(factoryArgs).toMatchObject({ apiKey: 'mm-env-secret' })
    expect(factoryArgs).not.toHaveProperty('baseURL')
  })

  it('a base URL stored for MiniMax via the DB is ignored', async () => {
    await adapter.setAiSettings({
      provider: 'minimax',
      apiKey: 'mm-db-secret',
      baseUrl: 'https://attacker.example',
    })
    const body = await (await buildApp().request('/api/settings/ai')).json()
    expect(body.effective.baseUrl).toBe('')
  })
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

  it('classifies provider errors into a fixed vocabulary (no echo)', async () => {
    genText = async () => {
      // Simulate an upstream message that would, if echoed, reveal probe info
      // (e.g. internal IP, response body, banner). The handler must collapse it.
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434 — listening process: ollama-internal')
    }
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: 'http://example.com',
      apiKey: 'sk-bad',
    })
    const body = await r.json()
    expect(body).toEqual({ ok: false, error: 'network_error' })
    expect(JSON.stringify(body)).not.toContain('ollama-internal')
    expect(JSON.stringify(body)).not.toContain('127.0.0.1')
  })

  it('classifies auth failures as auth_error', async () => {
    genText = async () => {
      throw new Error('401 invalid api key')
    }
    const r = await jsonReq(buildApp(), '/api/settings/ai/test', 'POST', {
      provider: 'openai',
      apiKey: 'sk-bad',
    })
    expect(await r.json()).toEqual({ ok: false, error: 'auth_error' })
  })
})

describe('aiSettingsPatch validation', () => {
  it('rejects a non-URL baseUrl', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai-compatible',
      baseUrl: 'not a url',
    })
    expect(r.status).toBe(400)
  })

  it('rejects a non-http(s) baseUrl scheme', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai-compatible',
      baseUrl: 'file:///etc/passwd',
    })
    expect(r.status).toBe(400)
  })

  it('allows an empty baseUrl (unset)', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai',
      baseUrl: '',
    })
    expect(r.status).toBe(204)
  })

  it('allows loopback baseUrl for self-hosted Ollama', async () => {
    const r = await jsonReq(buildApp(), '/api/settings/ai', 'PATCH', {
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
    })
    expect(r.status).toBe(204)
  })
})

describe('method not allowed', () => {
  it('405s on unsupported verbs', async () => {
    const r = await buildApp().request('/api/settings/ai', { method: 'DELETE' })
    expect(r.status).toBe(405)
    expect(r.headers.get('Allow')).toBe('GET, PATCH')
  })
})
