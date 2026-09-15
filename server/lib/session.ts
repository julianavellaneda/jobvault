import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sealData, unsealData } from 'iron-session'
import { getAdapter } from './db.ts'

export interface AppSession {
  userId?: string
}

// What's sealed into the cookie. `sid` points at a row in the `sessions` table,
// so logout revokes the session server-side instead of only clearing the
// browser's copy of a cookie that would otherwise stay valid for 30 days.
interface SealedSession {
  userId?: string
  sid?: string
}

const APP_COOKIE = 'app_session'
const APP_MAX_AGE_SEC = 60 * 60 * 24 * 30

function sessionPassword(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  return s
}

export function assertSessionSecret(): void {
  sessionPassword()
}

// Browsers drop Secure cookies on plain-HTTP origins other than localhost.
// Default to Secure in production; COOKIE_SECURE=false lets a LAN install
// without TLS keep NODE_ENV=production.
function secureCookies(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return process.env.NODE_ENV === 'production'
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  }
}

async function readSealed(c: Context): Promise<SealedSession> {
  const raw = getCookie(c, APP_COOKIE)
  if (!raw) return {}
  try {
    return (await unsealData<SealedSession>(raw, { password: sessionPassword() })) ?? {}
  } catch {
    return {}
  }
}

export async function getAppSession(c: Context): Promise<AppSession> {
  const { userId, sid } = await readSealed(c)
  if (!userId || !sid) return {}
  const row = await (await getAdapter()).findSession(sid)
  if (!row || row.userId !== userId || row.expiresAt <= Date.now()) return {}
  return { userId }
}

export async function saveAppSession(c: Context, data: AppSession): Promise<void> {
  if (!data.userId) {
    await destroyAppSession(c)
    return
  }
  const adapter = await getAdapter()
  const now = Date.now()
  // Signing in replaces any session this browser already had.
  const previous = await readSealed(c)
  if (previous.sid) await adapter.deleteSession(previous.sid)
  await adapter.deleteExpiredSessions(now)

  const row = await adapter.createSession({
    userId: data.userId,
    expiresAt: now + APP_MAX_AGE_SEC * 1000,
  })
  const payload: SealedSession = { userId: data.userId, sid: row.id }
  const sealed = await sealData(payload, { password: sessionPassword(), ttl: APP_MAX_AGE_SEC })
  setCookie(c, APP_COOKIE, sealed, cookieOpts(APP_MAX_AGE_SEC))
}

export async function destroyAppSession(c: Context): Promise<void> {
  const { sid } = await readSealed(c)
  if (sid) await (await getAdapter()).deleteSession(sid)
  deleteCookie(c, APP_COOKIE, { path: '/' })
}
