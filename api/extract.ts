import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAX_HTML_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 12_000
const MAX_TEXT_CHARS = 15_000

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

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, m => {
      const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(m)
      const ogs = Array.from(m.matchAll(/<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']+)["']/gi))
        .filter(([, k]) => /og:|twitter:|description/i.test(k))
        .map(([, k, v]) => `${k}: ${v}`)
        .join('\n')
      const ld = Array.from(m.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))
        .map(([, body]) => body)
        .join('\n')
      return ['TITLE:', titleMatch?.[1] ?? '', ogs, 'JSONLD:', ld].join('\n')
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, error: `fetch_${res.status}` }
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return { ok: false, error: 'empty_response' }
    const slice = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice)
    const text = htmlToText(html).slice(0, MAX_TEXT_CHARS)
    if (text.length < 80) return { ok: false, error: 'page_blocked_or_empty' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}

const SYSTEM_PROMPT =
  'You extract structured fields from a job-posting web page. ' +
  'Return ONLY a JSON object with these string keys: company, role, salary, location, workArrangement, source. ' +
  'Rules: ' +
  '- workArrangement MUST be one of: "remote", "hybrid", "onsite", or "" (empty if unclear). ' +
  '- source is the platform/board (e.g. "LinkedIn", "Greenhouse", "Lever", "company site", "Indeed"). Infer from URL/branding. ' +
  '- salary: keep original currency/range as written; "" if not stated. ' +
  '- Use "" (empty string) for any unknown field. Do NOT guess. ' +
  '- No commentary, no markdown, no code fences. Just the JSON object.'

async function callMinimax(url: string, text: string): Promise<{ ok: true; extracted: ExtractedFields } | { ok: false; error: string }> {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) return { ok: false, error: 'missing_MINIMAX_API_KEY' }
  const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'
  const model = process.env.MINIMAX_MODEL || 'MiniMax-Text-01'

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `URL: ${url}\n\nPAGE CONTENT:\n${text}\n\nReturn the JSON object now.`,
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'llm_network' }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { ok: false, error: `llm_${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}` }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return { ok: false, error: 'llm_invalid_json' }
  }

  const content = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content
  if (!content) return { ok: false, error: 'llm_empty_content' }

  let parsed: Partial<ExtractedFields>
  try {
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return { ok: false, error: 'llm_unparseable_json' }
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
  const url = (req.body as { url?: unknown })?.url
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'invalid_url' })
    return
  }

  const page = await fetchPage(url)
  if (!page.ok) {
    res.status(200).json({ error: page.error })
    return
  }

  const llm = await callMinimax(url, page.text)
  if (!llm.ok) {
    res.status(200).json({ error: llm.error })
    return
  }

  res.status(200).json({ extracted: llm.extracted })
}
