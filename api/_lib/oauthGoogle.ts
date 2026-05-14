import type { VercelRequest } from '@vercel/node'

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing_env:${name}`)
  return v
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('OAUTH_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })
  return `${AUTHORIZE}?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  id_token?: string
  expires_in: number
  token_type: string
}

export interface GoogleUserInfo {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  picture?: string
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv('OAUTH_CLIENT_ID'),
    client_secret: requireEnv('OAUTH_CLIENT_SECRET'),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) throw new Error(`token_exchange_failed:${r.status}`)
  return r.json() as Promise<TokenResponse>
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const r = await fetch(USERINFO, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) throw new Error(`userinfo_failed:${r.status}`)
  return r.json() as Promise<GoogleUserInfo>
}

export function redirectUriFor(req: VercelRequest): string {
  const base = process.env.PUBLIC_BASE_URL
  if (base) return `${base.replace(/\/$/, '')}/api/auth/callback`
  const host = req.headers.host || 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}/api/auth/callback`
}

export function postLoginRedirect(): string {
  return process.env.PUBLIC_BASE_URL || '/'
}
