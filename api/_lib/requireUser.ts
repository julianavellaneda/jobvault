import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { StoredUser } from '@/auth/adapter'
import { readSessionUser } from './session.js'
import { isAllowed } from './allowlist.js'

export type UserResult =
  | { ok: true; user: StoredUser }
  | { ok: false; status: number; error: string }

const LOCAL_USER: StoredUser = {
  uid: 'local',
  email: 'local@self-host',
  displayName: 'Local User',
}

function noAuthAllowed(): boolean {
  // Fail closed in production unless self-host operator opts in explicitly.
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return process.env.ALLOW_NO_AUTH === 'true'
  }
  return true
}

export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<UserResult> {
  const mode = (process.env.AUTH_MODE || 'none').toLowerCase()
  if (mode === 'none') {
    if (!noAuthAllowed()) {
      return { ok: false, status: 503, error: 'auth_not_configured' }
    }
    return { ok: true, user: LOCAL_USER }
  }
  if (mode === 'oauth') {
    const user = await readSessionUser(req, res)
    if (!user) return { ok: false, status: 401, error: 'unauthenticated' }
    if (!(await isAllowed(user.email))) {
      return { ok: false, status: 403, error: 'not_allowed' }
    }
    return { ok: true, user }
  }
  return { ok: false, status: 500, error: `unknown_auth_mode:${mode}` }
}
