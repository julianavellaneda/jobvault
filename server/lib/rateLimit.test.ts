import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _rateLimitSizeForTests,
  _resetRateLimitForTests,
  checkRateLimit,
  rateLimit,
  recordRateLimitHit,
} from './rateLimit'

beforeEach(() => {
  _resetRateLimitForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('allows up to the limit, then reports retryAfter', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000)).toEqual({ ok: true })
    const blocked = rateLimit('k', 3, 60_000)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('checkRateLimit does not count as a hit', () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit('k', 1, 60_000)).toEqual({ ok: true })
    recordRateLimitHit('k', 60_000)
    expect(checkRateLimit('k', 1, 60_000).ok).toBe(false)
  })

  it('resets once the window has passed', () => {
    vi.useFakeTimers()
    recordRateLimitHit('k', 1_000)
    expect(checkRateLimit('k', 1, 1_000).ok).toBe(false)
    vi.advanceTimersByTime(1_001)
    expect(checkRateLimit('k', 1, 1_000)).toEqual({ ok: true })
  })

  it('caps the number of tracked keys', () => {
    for (let i = 0; i < 10_500; i++) recordRateLimitHit(`ip:${i}`, 60_000)
    expect(_rateLimitSizeForTests()).toBeLessThanOrEqual(10_000)
  })
})
