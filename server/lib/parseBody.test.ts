import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseBody } from './parseBody'

describe('parseBody', () => {
  it('rejects bodies over the byte limit', async () => {
    const app = new Hono()
    app.post('/', async c => {
      const parsed = await parseBody(c, z.object({ value: z.string() }), 12)
      if (!parsed.ok) return parsed.response
      return c.json(parsed.data)
    })

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'too large' }),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'body_too_large' })
  })

  it.each(['text/plain', 'application/x-www-form-urlencoded', undefined])(
    'rejects a JSON-looking body sent as %s (cross-site form CSRF)',
    async contentType => {
      const app = new Hono()
      app.post('/', async c => {
        const parsed = await parseBody(c, z.object({ value: z.string() }))
        if (!parsed.ok) return parsed.response
        return c.json(parsed.data)
      })

      const response = await app.request('/', {
        method: 'POST',
        headers: contentType ? { 'content-type': contentType } : {},
        body: JSON.stringify({ value: 'x' }),
      })

      expect(response.status).toBe(415)
    },
  )

  it('accepts application/json with a charset parameter', async () => {
    const app = new Hono()
    app.post('/', async c => {
      const parsed = await parseBody(c, z.object({ value: z.string() }))
      if (!parsed.ok) return parsed.response
      return c.json(parsed.data)
    })

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ value: 'x' }),
    })

    expect(response.status).toBe(200)
  })
})
