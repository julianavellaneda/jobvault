import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { clientIp } from '../lib/clientIp.ts'
import { parseBody } from '../lib/parseBody.ts'
import { getMinPasswordLength, MAX_PASSWORD_LENGTH } from '../lib/passwordPolicy.ts'
import { checkRateLimit, rateLimit, recordRateLimitHit } from '../lib/rateLimit.ts'
import {
  destroyAppSession,
  getAppSession,
  saveAppSession,
} from '../lib/session.ts'
import { setupTokenRequired, verifySetupToken } from '../lib/setupToken.ts'
import {
  countUsers,
  createInitialUser,
  findUserById,
  verifyUserPassword,
} from '../lib/users.ts'

const app = new Hono()

// Only failed logins count. The per-IP limit stops one client guessing; the
// per-username limit caps a guess spread across many IPs against one account.
const LOGIN_IP_LIMIT = 5
const LOGIN_IP_WINDOW_MS = 5 * 60 * 1000
const LOGIN_USER_LIMIT = 20
const LOGIN_USER_WINDOW_MS = 15 * 60 * 1000

function tooManyRequests(c: Context, retryAfterSec: number) {
  c.header('Retry-After', String(retryAfterSec))
  return c.json({ error: 'rate_limited', retryAfterSec }, 429)
}

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, and . _ -')

function buildSetupSchema() {
  return z.object({
    username: usernameSchema,
    password: z.string().min(getMinPasswordLength()).max(MAX_PASSWORD_LENGTH),
    setupToken: z.string().max(200).optional(),
  })
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

function toPublicUser(u: { id: string; username: string; role: 'admin' }) {
  return { id: u.id, username: u.username, role: u.role }
}

function needsSetup() {
  return {
    status: 'needs-setup' as const,
    minPasswordLength: getMinPasswordLength(),
    setupTokenRequired: setupTokenRequired(),
  }
}

app.get('/me', async c => {
  const userCount = await countUsers()
  if (userCount === 0) return c.json(needsSetup())
  const session = await getAppSession(c)
  if (!session.userId) return c.json({ status: 'signed-out' })
  const user = await findUserById(session.userId)
  if (!user) {
    if ((await countUsers()) === 0) return c.json(needsSetup())
    return c.json({ status: 'signed-out' })
  }
  return c.json({ status: 'signed-in', user: toPublicUser(user) })
})

app.post('/setup', async c => {
  if ((await countUsers()) > 0) {
    return c.json({ error: 'setup_already_complete' }, 410)
  }
  const limit = rateLimit(`setup:${await clientIp(c)}`)
  if (!limit.ok) return tooManyRequests(c, limit.retryAfterSec)
  const parsed = await parseBody(c, buildSetupSchema())
  if (!parsed.ok) return parsed.response
  if (!verifySetupToken(parsed.data.setupToken)) {
    return c.json({ error: 'invalid_setup_token' }, 401)
  }

  let user
  try {
    user = await createInitialUser({
      username: parsed.data.username,
      password: parsed.data.password,
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'setup_already_complete') {
      return c.json({ error: 'setup_already_complete' }, 410)
    }
    throw e
  }
  await saveAppSession(c, { userId: user.id })
  return c.json({ status: 'signed-in', user: toPublicUser(user) })
})

app.post('/login', async c => {
  const ipKey = `login-ip:${await clientIp(c)}`
  const ipLimit = checkRateLimit(ipKey, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS)
  if (!ipLimit.ok) return tooManyRequests(c, ipLimit.retryAfterSec)

  const parsed = await parseBody(c, loginSchema)
  if (!parsed.ok) return parsed.response

  const userKey = `login-user:${parsed.data.username.toLowerCase()}`
  const userLimit = checkRateLimit(userKey, LOGIN_USER_LIMIT, LOGIN_USER_WINDOW_MS)
  if (!userLimit.ok) return tooManyRequests(c, userLimit.retryAfterSec)

  const user = await verifyUserPassword(parsed.data.username, parsed.data.password)
  if (!user) {
    recordRateLimitHit(ipKey, LOGIN_IP_WINDOW_MS)
    recordRateLimitHit(userKey, LOGIN_USER_WINDOW_MS)
    return c.json({ error: 'invalid_credentials' }, 401)
  }
  await saveAppSession(c, { userId: user.id })
  return c.json({ status: 'signed-in', user: toPublicUser(user) })
})

app.post('/logout', async c => {
  await destroyAppSession(c)
  return c.body(null, 204)
})

export default app
