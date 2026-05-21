import { afterEach, describe, expect, it } from 'vitest'
import { getMinPasswordLength, MAX_PASSWORD_LENGTH } from './passwordPolicy'

afterEach(() => {
  delete process.env.MIN_PASSWORD_LENGTH
})

describe('getMinPasswordLength', () => {
  it('defaults to 1 (no requirement) when unset', () => {
    delete process.env.MIN_PASSWORD_LENGTH
    expect(getMinPasswordLength()).toBe(1)
  })

  it('defaults to 1 when blank', () => {
    process.env.MIN_PASSWORD_LENGTH = '  '
    expect(getMinPasswordLength()).toBe(1)
  })

  it('honors a valid positive integer', () => {
    process.env.MIN_PASSWORD_LENGTH = '16'
    expect(getMinPasswordLength()).toBe(16)
  })

  it('falls back to 1 for non-numeric or non-positive values', () => {
    process.env.MIN_PASSWORD_LENGTH = 'abc'
    expect(getMinPasswordLength()).toBe(1)
    process.env.MIN_PASSWORD_LENGTH = '0'
    expect(getMinPasswordLength()).toBe(1)
    process.env.MIN_PASSWORD_LENGTH = '-5'
    expect(getMinPasswordLength()).toBe(1)
  })

  it('caps at MAX_PASSWORD_LENGTH', () => {
    process.env.MIN_PASSWORD_LENGTH = '9999'
    expect(getMinPasswordLength()).toBe(MAX_PASSWORD_LENGTH)
  })
})
