import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetSetupTokenForTests,
  getSetupToken,
  setupTokenRequired,
  verifySetupToken,
} from './setupToken'

afterEach(() => {
  delete process.env.HOST
  delete process.env.SETUP_TOKEN
  _resetSetupTokenForTests()
})

describe('setupToken', () => {
  it.each(['127.0.0.1', '127.0.0.53', 'localhost', '::1'])(
    'is not required when bound to loopback (%s)',
    host => {
      process.env.HOST = host
      expect(setupTokenRequired()).toBe(false)
      expect(verifySetupToken(undefined)).toBe(true)
    },
  )

  it('is not required with the default bind address', () => {
    expect(setupTokenRequired()).toBe(false)
  })

  it.each(['0.0.0.0', '::', '192.168.1.20'])('is required when bound to %s', host => {
    process.env.HOST = host
    expect(setupTokenRequired()).toBe(true)
    expect(verifySetupToken(undefined)).toBe(false)
    expect(verifySetupToken('')).toBe(false)
  })

  it('generates a stable random token per process', () => {
    process.env.HOST = '0.0.0.0'
    const token = getSetupToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(getSetupToken()).toBe(token)
    expect(verifySetupToken(token)).toBe(true)
    expect(verifySetupToken(`${token}x`)).toBe(false)
  })

  it('uses SETUP_TOKEN when the operator provides one', () => {
    process.env.HOST = '0.0.0.0'
    process.env.SETUP_TOKEN = 'chosen-by-operator'
    expect(verifySetupToken('chosen-by-operator')).toBe(true)
    expect(verifySetupToken(' chosen-by-operator ')).toBe(true)
  })
})
