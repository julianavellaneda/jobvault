import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getOAuthStateSession, getSession } from '../_lib/session.js'
import {
  exchangeCode,
  fetchUserInfo,
  postLoginRedirect,
  redirectUriFor,
} from '../_lib/oauthGoogle.js'
import { isAllowed } from '../_lib/allowlist.js'
import { pathParam } from '../_lib/http.js'

function deny(res: VercelResponse, status: number, msg: string): void {
  res.status(status).setHeader('content-type', 'text/html')
  res.send(
    `<!doctype html><html><head><title>Sign-in failed</title></head>` +
      `<body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto">` +
      `<h1>Sign-in failed</h1><p>${msg}</p>` +
      `<p><a href="/">Return home</a></p></body></html>`,
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((process.env.AUTH_MODE || 'none').toLowerCase() !== 'oauth') {
    res.status(404).json({ error: 'oauth_not_enabled' })
    return
  }
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const code = pathParam(req, 'code')
  const state = pathParam(req, 'state')
  if (!code || !state) {
    deny(res, 400, 'Missing code or state.')
    return
  }

  let expectedState: string | undefined
  try {
    const stateSession = await getOAuthStateSession(req, res)
    expectedState = stateSession.state
    stateSession.destroy()
  } catch (e) {
    console.error('callback_state_error', e)
    deny(res, 500, 'Session storage misconfigured.')
    return
  }
  if (!expectedState || expectedState !== state) {
    deny(res, 400, 'Invalid state — try signing in again.')
    return
  }

  let user
  try {
    const tok = await exchangeCode(code, redirectUriFor(req))
    const info = await fetchUserInfo(tok.access_token)
    if (!info.email_verified) {
      deny(res, 403, 'Your Google account email is not verified.')
      return
    }
    user = {
      uid: info.sub,
      email: info.email,
      displayName: info.name || info.email,
    }
  } catch (e) {
    console.error('oauth_exchange_error', e)
    deny(res, 502, 'OAuth provider error. Try again.')
    return
  }

  if (!(await isAllowed(user.email))) {
    deny(res, 403, `<code>${user.email}</code> is not in the allowlist for this deployment.`)
    return
  }

  try {
    const session = await getSession(req, res)
    session.user = user
    await session.save()
  } catch (e) {
    console.error('session_save_error', e)
    deny(res, 500, 'Could not establish session.')
    return
  }

  res.setHeader('Location', postLoginRedirect())
  res.status(302).end()
}
