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
  const adapter = await getAdapter()
  const patch = { ...parsed.data }
  // A saved key stays bound to the provider + endpoint it was entered for.
  // Changing either without supplying a key clears it, so a hijacked session
  // can't repoint the base URL and have the next extraction send the key there.
  const current = await adapter.getAiSettings()
  if (current && patch.apiKey === undefined) {
    const nextProvider = patch.provider ?? current.provider
    const providerChanged = nextProvider !== current.provider
    const baseUrlChanged =
      AI_PROVIDERS[nextProvider].needsBaseUrl &&
      patch.baseUrl !== undefined &&
      patch.baseUrl !== current.baseUrl
    if (providerChanged || baseUrlChanged) patch.apiKey = ''
  }
  await adapter.setAiSettings(patch)
  return c.body(null, 204)
})

app.post('/ai/test', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)

  const limit = rateLimit(auth.user.username)
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
  const sameProvider = provider === stored.config.provider
  // Only openai-compatible takes a base URL from the request. Hosted providers
  // keep whatever the resolved config has (MiniMax's env-only regional URL).
  const baseUrl = meta.needsBaseUrl
    ? (body.baseUrl ?? (sameProvider ? stored.config.baseUrl : ''))
    : sameProvider
      ? stored.config.baseUrl
      : ''
  // Reuse the stored key only against the endpoint it was saved for — otherwise
  // a request could point baseUrl at its own server and receive the key
  // (including an operator's env key) in the Authorization header.
  const canReuseKey = sameProvider && baseUrl === stored.config.baseUrl
  const config: ResolvedAiConfig = {
    provider,
    model: body.model ?? stored.config.model,
    baseUrl,
    apiKey: body.apiKey?.trim() ? body.apiKey : canReuseKey ? stored.config.apiKey : '',
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
    return c.json({ ok: false, error: classifyAiTestError(e) })
  } finally {
    clearTimeout(timer)
  }
})

// Map upstream SDK errors to a fixed vocabulary so a signed-in user can't use
// the test endpoint as a probe for internal HTTP services (relevant when
// provider is openai-compatible and baseUrl points at loopback or RFC1918).
function classifyAiTestError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : '').toLowerCase()
  if (!msg) return 'test_failed'
  if (/aborted|timeout|timed out/.test(msg)) return 'timeout'
  if (/401|403|unauthor|forbidden|invalid.*api|api.*key/.test(msg)) return 'auth_error'
  if (/404|not.*found|no.*such.*model|unknown.*model|model.*not/.test(msg)) return 'model_not_found'
  if (/429|rate.?limit|quota/.test(msg)) return 'rate_limited'
  if (/econnrefused|enotfound|econnreset|eai_again|network|fetch failed|tls|certificate/.test(msg)) {
    return 'network_error'
  }
  return 'test_failed'
}

app.all('/ai', c => {
  c.header('Allow', 'GET, PATCH')
  return c.json({ error: 'method_not_allowed' }, 405)
})
app.all('/ai/test', c => {
  c.header('Allow', 'POST')
  return c.json({ error: 'method_not_allowed' }, 405)
})

export default app
