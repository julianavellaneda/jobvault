import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { ZodType } from 'zod'

export function readBody(req: VercelRequest): unknown {
  if (req.body == null) return undefined
  if (typeof req.body === 'string') {
    if (req.body.length === 0) return undefined
    try {
      return JSON.parse(req.body)
    } catch {
      return undefined
    }
  }
  return req.body
}

export function parseBody<T>(req: VercelRequest, res: VercelResponse, schema: ZodType<T>): T | null {
  const raw = readBody(req)
  const result = schema.safeParse(raw)
  if (!result.success) {
    res.status(400).json({ error: 'invalid_body', issues: result.error.issues })
    return null
  }
  return result.data
}

export function methodNotAllowed(res: VercelResponse, allow: string[]): void {
  res.setHeader('Allow', allow.join(', '))
  res.status(405).json({ error: 'method_not_allowed' })
}

export function pathParam(req: VercelRequest, key: string): string | null {
  const val = req.query?.[key]
  if (typeof val === 'string' && val.length > 0) return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0]
  return null
}
