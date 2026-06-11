import { describe, expect, it } from 'vitest'
import { monogramColor } from './monogram'

describe('monogramColor', () => {
  it('is deterministic for the same name', () => {
    expect(monogramColor('Stripe')).toBe(monogramColor('Stripe'))
    expect(monogramColor('Acme Corp')).toBe(monogramColor('Acme Corp'))
  })

  it('matches pinned algorithm output (guards against silent drift)', () => {
    // Hues are the real FNV-1a-mod-360 outputs; lightness/chroma are fixed.
    expect(monogramColor('Stripe')).toBe('oklch(0.48 0.15 20)')
    expect(monogramColor('Shopify')).toBe('oklch(0.48 0.15 305)')
    expect(monogramColor('Apple')).toBe('oklch(0.48 0.15 87)')
    expect(monogramColor('')).toBe('oklch(0.48 0.15 61)')
  })

  it('returns a valid oklch() string', () => {
    expect(monogramColor('Stripe')).toMatch(/^oklch\(/)
    expect(monogramColor('')).toMatch(/^oklch\(/)
  })

  it('varies the hue across different names', () => {
    expect(monogramColor('Stripe')).not.toBe(monogramColor('Shopify'))
    expect(monogramColor('Google')).not.toBe(monogramColor('Apple'))
    expect(monogramColor('Acme')).not.toBe(monogramColor('Globex'))
  })

  it('does not throw on the empty string', () => {
    expect(() => monogramColor('')).not.toThrow()
  })

  it('uses fixed lightness and chroma so white text reads in both themes', () => {
    // Fixed L=0.48 (raised from 0.52 for white-text contrast across hues), C=0.15.
    const color = monogramColor('Anything')
    const match = color.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
    expect(match).not.toBeNull()
    if (match) {
      expect(Number(match[1])).toBeCloseTo(0.48, 2)
      expect(Number(match[2])).toBeCloseTo(0.15, 2)
    }
  })

  it('keeps the hue within a valid 0-360 range', () => {
    for (const name of ['a', 'b', 'company-with-a-very-long-name', 'X', '']) {
      const match = monogramColor(name).match(/^oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)$/)
      expect(match).not.toBeNull()
      if (match) {
        const hue = Number(match[1])
        expect(hue).toBeGreaterThanOrEqual(0)
        expect(hue).toBeLessThan(360)
      }
    }
  })
})
