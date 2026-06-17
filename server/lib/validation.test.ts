import { describe, it, expect } from 'vitest'
import { newApplicationSchema } from './validation.ts'

describe('newApplicationSchema url', () => {
  it('accepts a manual entry with no url (empty string)', () => {
    const parsed = newApplicationSchema.safeParse({ company: 'Acme', url: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.url).toBe('')
  })

  it('defaults a missing url to empty string', () => {
    const parsed = newApplicationSchema.safeParse({ company: 'Acme' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.url).toBe('')
  })

  it('accepts a valid http(s) url', () => {
    const parsed = newApplicationSchema.safeParse({ company: 'Acme', url: 'https://acme.com/jobs/1' })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-empty malformed url', () => {
    const parsed = newApplicationSchema.safeParse({ company: 'Acme', url: 'not a url' })
    expect(parsed.success).toBe(false)
  })

  it('rejects a non-http(s) scheme', () => {
    const parsed = newApplicationSchema.safeParse({ company: 'Acme', url: 'ftp://acme.com' })
    expect(parsed.success).toBe(false)
  })
})
