import type { VercelRequest } from '@vercel/node'
import type { Auth } from 'firebase-admin/auth'
import { getAdmin } from './firebaseAdmin.js'

export type AuthResult =
  | { ok: true; email: string; uid: string }
  | { ok: false; status: number; error: string }

export async function requireAllowedUser(req: VercelRequest): Promise<AuthResult> {
  const header = req.headers.authorization || req.headers.Authorization
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw || !raw.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'missing_token' }
  }
  const token = raw.slice('Bearer '.length).trim()
  if (!token) return { ok: false, status: 401, error: 'missing_token' }

  let admin: { auth: Auth; db: ReturnType<typeof getAdmin>['db'] }
  try {
    admin = getAdmin()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'admin_init_failed'
    return { ok: false, status: 500, error: msg }
  }

  let decoded: Awaited<ReturnType<typeof admin.auth.verifyIdToken>>
  try {
    decoded = await admin.auth.verifyIdToken(token)
  } catch {
    return { ok: false, status: 401, error: 'invalid_token' }
  }

  const email = decoded.email
  if (!email) return { ok: false, status: 403, error: 'no_email_in_token' }

  try {
    const snap = await admin.db.doc(`allowlist/${email}`).get()
    if (!snap.exists) return { ok: false, status: 403, error: 'not_allowlisted' }
  } catch {
    return { ok: false, status: 500, error: 'allowlist_lookup_failed' }
  }

  return { ok: true, email, uid: decoded.uid }
}
