import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session'
import type { StoredUser } from '@/auth/adapter'

export interface AppSession {
  user?: StoredUser
}

export interface OAuthStateSession {
  state?: string
}

function sessionPassword(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  return s
}

function isProd(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

function appOptions(): SessionOptions {
  return {
    cookieName: 'app_session',
    password: sessionPassword(),
    cookieOptions: {
      secure: isProd(),
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    },
  }
}

function oauthStateOptions(): SessionOptions {
  return {
    cookieName: 'oauth_state',
    password: sessionPassword(),
    cookieOptions: {
      secure: isProd(),
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    },
  }
}

export async function getSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<IronSession<AppSession>> {
  return getIronSession<AppSession>(req, res, appOptions())
}

export async function getOAuthStateSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<IronSession<OAuthStateSession>> {
  return getIronSession<OAuthStateSession>(req, res, oauthStateOptions())
}

// Tests mock this to bypass iron-session crypto without stamping real cookies.
export async function readSessionUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<StoredUser | null> {
  try {
    const s = await getSession(req, res)
    return s.user ?? null
  } catch {
    return null
  }
}
