import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sealData, unsealData } from 'iron-session'

export interface AppSession {
  userId?: string
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

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  }
}

export async function getAppSession(c: Context): Promise<AppSession> {
  const raw = getCookie(c, APP_COOKIE)
  if (!raw) return {}
  try {
    return (await unsealData<AppSession>(raw, { password: sessionPassword() })) ?? {}
  } catch {
    return {}
  }
}

export async function saveAppSession(c: Context, data: AppSession): Promise<void> {
  const sealed = await sealData(data, { password: sessionPassword(), ttl: APP_MAX_AGE_SEC })
  setCookie(c, APP_COOKIE, sealed, cookieOpts(APP_MAX_AGE_SEC))
}

export function destroyAppSession(c: Context): void {
  deleteCookie(c, APP_COOKIE, { path: '/' })
}
