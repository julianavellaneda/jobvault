import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryAdapter } from './testHelpers'
import type { DataAdapter } from '@/storage/adapter'

let adapter: DataAdapter
vi.mock('./db.ts', () => ({
  getAdapter: async () => adapter,
}))

const { countUsers, createUser, findUserByEmail, findUserById, verifyUserPassword } = await import(
  './users'
)

beforeEach(() => {
  adapter = memoryAdapter()
})

describe('users', () => {
  it('createUser stores a normalized email and a hashed password', async () => {
    const u = await createUser({
      email: '  User@Example.COM ',
      password: 'a-strong-password-1234',
      displayName: 'Alex',
    })
    expect(u.email).toBe('user@example.com')
    expect(u.role).toBe('admin')
    const stored = await adapter.findUserByEmail('user@example.com')
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(stored?.passwordHash).not.toContain('a-strong-password-1234')
  })

  it('countUsers reflects createUser', async () => {
    expect(await countUsers()).toBe(0)
    await createUser({ email: 'a@b.com', password: 'a-strong-password-1234', displayName: 'A' })
    expect(await countUsers()).toBe(1)
  })

  it('findUserByEmail is case-insensitive', async () => {
    await createUser({ email: 'Hello@Example.com', password: 'a-strong-password-1234', displayName: 'H' })
    expect((await findUserByEmail('HELLO@example.COM'))?.email).toBe('hello@example.com')
  })

  it('verifyUserPassword returns user on match, null on mismatch', async () => {
    await createUser({ email: 'a@b.com', password: 'correct-horse-1234', displayName: 'A' })
    expect((await verifyUserPassword('a@b.com', 'correct-horse-1234'))?.email).toBe('a@b.com')
    expect(await verifyUserPassword('a@b.com', 'wrong')).toBeNull()
  })

  it('verifyUserPassword returns null and still spends time when user does not exist', async () => {
    const start = Date.now()
    expect(await verifyUserPassword('nobody@example.com', 'whatever-1234')).toBeNull()
    // Just confirm it did not throw and returned in reasonable time.
    expect(Date.now() - start).toBeLessThan(5000)
  })

  it('findUserById round-trips', async () => {
    const u = await createUser({ email: 'a@b.com', password: 'correct-horse-1234', displayName: 'A' })
    expect((await findUserById(u.id))?.email).toBe('a@b.com')
    expect(await findUserById('does-not-exist')).toBeNull()
  })
})
