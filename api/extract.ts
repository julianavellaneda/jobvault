import type { VercelRequest, VercelResponse } from '@vercel/node'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { generateText } from 'ai'
import { minimax } from 'vercel-minimax-ai-provider'
import { requireAllowedUser } from './_lib/requireAllowedUser.js'
import { resolveSafeUrl, safeUrl, type ResolvedAddress } from './_lib/safeUrl.js'
import { rateLimit } from './_lib/rateLimit.js'
import { htmlToText } from './_lib/htmlToText.js'

const MAX_HTML_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 3

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0 Safari/537.36'

type ResponseSnapshot = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

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

async function fetchPage(
  initialUrl: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let current = await resolveSafeUrl(initialUrl)
    if (!current.ok) return current
    let res: ResponseSnapshot | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetchValidatedUrl(current.parsed, current.addresses, controller.signal)
      if (res.status >= 300 && res.status < 400) {
        const next = headerValue(res.headers.location)
        if (!next) return { ok: false, error: 'redirect_no_location' }
        const resolved = new URL(next, current.parsed).toString()
        const safety = await resolveSafeUrl(resolved)
        if (!safety.ok) return { ok: false, error: `redirect_${safety.error}` }
        current = safety
        continue
      }
      break
    }
    if (!res) return { ok: false, error: 'no_response' }
    if (res.status < 200 || res.status >= 300) return { ok: false, error: `fetch_${res.status}` }
    if (res.body.byteLength === 0) return { ok: false, error: 'empty_response' }
    const slice = res.body.byteLength > MAX_HTML_BYTES ? res.body.subarray(0, MAX_HTML_BYTES) : res.body
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice)
    const text = htmlToText(html)
    if (text.length < 80) return { ok: false, error: 'page_blocked_or_empty' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function fetchValidatedUrl(
  url: URL,
  addresses: ResolvedAddress[],
  signal: AbortSignal,
): Promise<ResponseSnapshot> {
  return new Promise((resolve, reject) => {
    const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest
    let index = 0

    const tryRequest = () => {
      const pinned = addresses[index]
      if (!pinned) {
        reject(new Error('dns_lookup_failed'))
        return
      }

      const req = requestImpl(
        url,
        {
          method: 'GET',
          headers: {
            'user-agent': UA,
            accept: 'text/html,application/xhtml+xml',
            'accept-language': 'en-US,en;q=0.9',
          },
          signal,
          lookup(_hostname, _options, callback) {
            callback(null, pinned.address, pinned.family)
          },
        },
        res => {
          const chunks: Buffer[] = []
          res.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          })
          res.on('error', reject)
        },
      )

      req.on('error', error => {
        index += 1
        if (index < addresses.length) {
          tryRequest()
          return
        }
        reject(error)
      })

      req.end()
    }

    tryRequest()
  })
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

async function callMinimax(
  url: string,
  text: string,
): Promise<{ ok: true; extracted: ExtractedFields } | { ok: false; error: string }> {
  if (!process.env.MINIMAX_API_KEY) return { ok: false, error: 'missing_MINIMAX_API_KEY' }
  const modelId = process.env.MINIMAX_MODEL || 'MiniMax-M2.5'

  let result: Awaited<ReturnType<typeof generateText>>
  try {
    result = await generateText({
      model: minimax(modelId),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const auth = await requireAllowedUser(req)
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const limit = rateLimit(auth.email)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    res.status(429).json({ error: 'rate_limited', retryAfterSec: limit.retryAfterSec })
    return
  }

  const url = (req.body as { url?: unknown })?.url
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'invalid_url' })
    return
  }

  const safety = await safeUrl(url)
  if (!safety.ok) {
    res.status(400).json({ error: safety.error })
    return
  }

  console.log('[extract] fetching:', url, 'for', auth.email)
  const page = await fetchPage(url)
  if (!page.ok) {
    console.error('[extract] fetch failed:', page.error)
    res.status(200).json({ error: page.error })
    return
  }
  console.log('[extract] page text length:', page.text.length)

  const llm = await callMinimax(url, page.text)
  if (!llm.ok) {
    console.error('[extract] LLM failed:', llm.error)
    res.status(200).json({ error: llm.error })
    return
  }

  res.status(200).json({ extracted: llm.extracted })
}
