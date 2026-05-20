import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('round-trips a password through hash + verify', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const a = await hashPassword('same-password-1234')
    const b = await hashPassword('same-password-1234')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password-1234', a)).toBe(true)
    expect(await verifyPassword('same-password-1234', b)).toBe(true)
  })

  it('returns false on a malformed hash string instead of throwing', async () => {
    expect(await verifyPassword('whatever', 'not-a-real-hash')).toBe(false)
    expect(await verifyPassword('whatever', 'scrypt$broken')).toBe(false)
    expect(await verifyPassword('whatever', '')).toBe(false)
  })
})
