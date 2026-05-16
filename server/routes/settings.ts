import { Hono } from 'hono'
import { generateText } from 'ai'
import { getAdapter } from '../lib/db.ts'
import { requireUser } from '../lib/requireUser.ts'
import { rateLimit } from '../lib/rateLimit.ts'
import { parseBody } from '../lib/parseBody.ts'
import { aiSettingsPatchSchema, aiTestSchema } from '../lib/validation.ts'
import { AI_PROVIDERS, AI_PROVIDER_LIST, type ResolvedAiConfig } from '../lib/aiProviders.ts'
import { maskKey, resolveAiConfig } from '../lib/aiConfig.ts'

const TEST_TIMEOUT_MS = 12_000

const app = new Hono()

app.get('/ai', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)

  const adapter = await getAdapter()
  const resolved = await resolveAiConfig(adapter)
  const { config, source, ready } = resolved

  return c.json({
    source,
    ready,
    effective: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      hasKey: config.apiKey.trim().length > 0,
      keyPreview: maskKey(config.apiKey),
    },
    providers: AI_PROVIDER_LIST.map(p => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      needsBaseUrl: p.needsBaseUrl,
      keyOptional: p.keyOptional,
    })),
  })
})

app.patch('/ai', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)
  const parsed = await parseBody(c, aiSettingsPatchSchema)
  if (!parsed.ok) return parsed.response
  await (await getAdapter()).setAiSettings(parsed.data)
  return c.body(null, 204)
})

app.post('/ai/test', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)

  const limit = rateLimit(auth.user.email)
  if (!limit.ok) {
    c.header('Retry-After', String(limit.retryAfterSec))
    return c.json({ ok: false, error: 'rate_limited' }, 429)
  }

  const parsed = await parseBody(c, aiTestSchema)
  if (!parsed.ok) return parsed.response

  const adapter = await getAdapter()
  const stored = await resolveAiConfig(adapter)
  const body = parsed.data

  // Build the prospective config the user is editing. Omitted fields (and a
  // blank key) fall back to the resolved config so a saved key can be tested
  // without re-typing it.
  const provider = body.provider ?? stored.config.provider
  const meta = AI_PROVIDERS[provider]
  const config: ResolvedAiConfig = {
    provider,
    model: body.model ?? stored.config.model,
    baseUrl: body.baseUrl ?? stored.config.baseUrl,
    apiKey:
      body.apiKey && body.apiKey.trim()
        ? body.apiKey
        : provider === stored.config.provider
          ? stored.config.apiKey
          : '',
  }

  if (meta.needsBaseUrl && !config.baseUrl.trim()) {
    return c.json({ ok: false, error: 'missing_base_url' })
  }
  if (!meta.keyOptional && !config.apiKey.trim()) {
    return c.json({ ok: false, error: 'missing_api_key' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  try {
    const model = await meta.createModel(config)
    const res = await generateText({
      model,
      prompt: 'Reply with the single word OK.',
      abortSignal: controller.signal,
    })
    const text = res.text.trim()
    return c.json({ ok: true, model: config.model || meta.defaultModel, sample: text.slice(0, 40) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'test_failed'
    return c.json({ ok: false, error: msg.slice(0, 300) })
  } finally {
    clearTimeout(timer)
  }
})

app.all('/ai', c => {
  c.header('Allow', 'GET, PATCH')
  return c.json({ error: 'method_not_allowed' }, 405)
})
app.all('/ai/test', c => {
  c.header('Allow', 'POST')
  return c.json({ error: 'method_not_allowed' }, 405)
})

export default app
