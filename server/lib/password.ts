import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>

const N = 1 << 15 // CPU/memory cost
const R = 8
const P = 1
const KEYLEN = 64
const SALT_BYTES = 16
const MAXMEM = 128 * N * R * 4 // headroom above node's default

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const n = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false
    const salt = Buffer.from(parts[4], 'base64')
    const expected = Buffer.from(parts[5], 'base64')
    if (salt.length === 0 || expected.length === 0) return false
    const derived = await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    })
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

// Pre-computed hash of a value that can never match a real password.
// Used by the login route to keep the timing of "no such user" similar to
// "user exists but wrong password" so we don't leak account existence.
let dummyHashCache: string | null = null
export async function getDummyHash(): Promise<string> {
  if (dummyHashCache) return dummyHashCache
  dummyHashCache = await hashPassword('jobvault-dummy-hash-not-a-real-password')
  return dummyHashCache
}
