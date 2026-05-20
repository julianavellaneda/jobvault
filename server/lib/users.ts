import type { StoredLocalUser } from '@/storage/adapter'
import { getAdapter } from './db.ts'
import { getDummyHash, hashPassword, verifyPassword } from './password.ts'

export interface CreateUserInput {
  email: string
  password: string
  displayName: string
}

export async function countUsers(): Promise<number> {
  return (await getAdapter()).countUsers()
}

export async function findUserById(id: string): Promise<StoredLocalUser | null> {
  return (await getAdapter()).findUserById(id)
}

export async function findUserByEmail(email: string): Promise<StoredLocalUser | null> {
  return (await getAdapter()).findUserByEmail(email)
}

export async function createUser(input: CreateUserInput): Promise<StoredLocalUser> {
  const passwordHash = await hashPassword(input.password)
  return (await getAdapter()).createUser({
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    role: 'admin',
  })
}

export async function verifyUserPassword(
  email: string,
  password: string,
): Promise<StoredLocalUser | null> {
  const user = await findUserByEmail(email)
  if (!user) {
    // Spend roughly the same time as a real verify to avoid leaking
    // existence via timing.
    await verifyPassword(password, await getDummyHash())
    return null
  }
  const ok = await verifyPassword(password, user.passwordHash)
  return ok ? user : null
}
