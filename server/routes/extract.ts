import { Hono } from 'hono'
import { generateText } from 'ai'
import { requireUser } from '../lib/requireUser.ts'
import { safeUrl } from '../lib/safeUrl.ts'
import { rateLimit } from '../lib/rateLimit.ts'
import { htmlToText } from '../lib/htmlToText.ts'
import { getAdapter } from '../lib/db.ts'
import { AI_PROVIDERS } from '../lib/aiProviders.ts'
import { resolveAiConfig } from '../lib/aiConfig.ts'

const MAX_HTML_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 3

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0 Safari/537.36'

type ExtractedFields = {
  company: string
  role: string
  salary: string
  location: string
  workArrangement: 'remote' | 'hybrid' | 'onsite' | ''
  source: string
}

const EMPTY: ExtractedFields = {
  company: '',
  role: '',
  salary: '',
  location: '',
  workArrangement: '',
  source: '',
}

export async function fetchPage(
  initialUrl: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let current = initialUrl
    let res: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const safety = await safeUrl(current)
      if (!safety.ok) return hop === 0 ? safety : { ok: false, error: `redirect_${safety.error}` }

      res = await fetch(current, {
        method: 'GET',
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'manual',
      })

      if (res.status < 300 || res.status >= 400) break

      const location = res.headers.get('location')
      if (!location) return { ok: false, error: 'redirect_no_location' }
      current = new URL(location, current).toString()
      if (hop === MAX_REDIRECTS) return { ok: false, error: 'too_many_redirects' }
    }

    if (!res) return { ok: false, error: 'no_response' }
    if (res.status < 200 || res.status >= 300) return { ok: false, error: `fetch_${res.status}` }

    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > MAX_HTML_BYTES) {
      return { ok: false, error: 'response_too_large' }
    }

    const body = res.body
    if (!body) return { ok: false, error: 'empty_response' }

    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    let truncated = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > MAX_HTML_BYTES) {
        truncated = true
        try {
          await reader.cancel('response_too_large')
        } catch {
          // ignore
        }
        break
      }
      chunks.push(value)
    }
    if (received === 0) return { ok: false, error: 'empty_response' }

    const merged = new Uint8Array(truncated ? MAX_HTML_BYTES : received)
    let offset = 0
    for (const chunk of chunks) {
      const remaining = merged.byteLength - offset
      if (remaining <= 0) break
      const slice = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining)
      merged.set(slice, offset)
      offset += slice.byteLength
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(merged)
    const text = htmlToText(html)
    if (text.length < 80) return { ok: false, error: 'page_blocked_or_empty' }
    if (truncated) console.log('[extract] body truncated at', MAX_HTML_BYTES, 'bytes')
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}

const SYSTEM_PROMPT =
  'You extract structured fields from a job-posting web page. ' +
  'You MUST respond with ONLY a raw JSON object — no markdown, no code fences, no commentary, nothing else. ' +
  'The JSON must have exactly these string keys: company, role, salary, location, workArrangement, source. ' +
  'Rules: ' +
  '- workArrangement MUST be one of: "remote", "hybrid", "onsite", or "" (empty if unclear). ' +
  '- source is the platform/board (e.g. "LinkedIn", "Greenhouse", "Lever", "company site", "Indeed"). Infer from URL/branding. ' +
  '- salary: keep original currency/range as written; "" if not stated. ' +
  '- Use "" (empty string) for any unknown field. Do NOT guess. ' +
  'Example output: {"company":"Acme Corp","role":"Software Engineer","salary":"$120k-$150k","location":"New York, NY","workArrangement":"hybrid","source":"Greenhouse"}'

async function callModel(
  url: string,
  text: string,
): Promise<{ ok: true; extracted: ExtractedFields } | { ok: false; error: string }> {
  const resolved = await resolveAiConfig(await getAdapter())
  if (resolved.source === 'none' || !resolved.ready) {
    return { ok: false, error: 'ai_not_configured' }
  }
  const meta = AI_PROVIDERS[resolved.config.provider]

  let result: Awaited<ReturnType<typeof generateText>>
  try {
    const model = await meta.createModel(resolved.config)
    result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `URL: ${url}\n\nPAGE CONTENT:\n${text}\n\nReturn the JSON object now.`,
      temperature: 0.1,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'llm_call_failed'
    return { ok: false, error: `llm_error: ${msg.slice(0, 300)}` }
  }

  const answer = result.text.trim()
  console.log('[extract] LLM text:', answer)
  if (result.reasoning) console.log('[extract] LLM reasoning length:', result.reasoning.length)

  let parsed: Partial<ExtractedFields>
  try {
    const stripped = answer
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()
    const jsonMatch = stripped.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON object found')
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[extract] parse failed. text was:', answer, 'error:', e)
    return { ok: false, error: `llm_unparseable_json: ${answer.slice(0, 300)}` }
  }

  const wa = (parsed.workArrangement ?? '').toString().toLowerCase()
  const validWa: ExtractedFields['workArrangement'] =
    wa === 'remote' || wa === 'hybrid' || wa === 'onsite' ? wa : ''

  return {
    ok: true,
    extracted: {
      ...EMPTY,
      company: String(parsed.company ?? '').trim(),
      role: String(parsed.role ?? '').trim(),
      salary: String(parsed.salary ?? '').trim(),
      location: String(parsed.location ?? '').trim(),
      workArrangement: validWa,
      source: String(parsed.source ?? '').trim(),
    },
  }
}

const app = new Hono()

app.post('/', async c => {
  const auth = await requireUser(c)
  if (!auth.ok) return c.json({ error: auth.error }, auth.status)

  // Scope to the extract endpoint only. This is the sole rate-limited route:
  // it does an outbound page fetch + a paid LLM call (the real abuse vector).
  // Pending CRUD is cheap local SQLite bookkeeping and must NOT share this
  // budget, or normal use (~1 + 3 writes per link) exhausts 20/5min after a
  // handful of links and wedges rows on "extracting".
  const limit = rateLimit(`extract:${auth.user.email}`)
  if (!limit.ok) {
    c.header('Retry-After', String(limit.retryAfterSec))
    return c.json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec }, 429)
  }

  let body: { url?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_url' }, 400)
  }
  const url = body?.url
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return c.json({ error: 'invalid_url' }, 400)
  }

  const safety = await safeUrl(url)
  if (!safety.ok) return c.json({ error: safety.error }, 400)

  console.log('[extract] fetching:', url, 'for', auth.user.email)
  const page = await fetchPage(url)
  if (!page.ok) {
    console.error('[extract] fetch failed:', page.error)
    return c.json({ error: page.error })
  }
  console.log('[extract] page text length:', page.text.length)

  const llm = await callModel(url, page.text)
  if (!llm.ok) {
    console.error('[extract] LLM failed:', llm.error)
    return c.json({ error: llm.error })
  }

  return c.json({ extracted: llm.extracted })
})

app.all('/', c => {
  c.header('Allow', 'POST')
  return c.json({ error: 'method_not_allowed' }, 405)
})

export default app
