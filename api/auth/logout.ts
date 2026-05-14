import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/session.js'
import { methodNotAllowed } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }
  if ((process.env.AUTH_MODE || 'none').toLowerCase() !== 'oauth') {
    res.status(204).end()
    return
  }
  try {
    const s = await getSession(req, res)
    s.destroy()
  } catch (e) {
    console.error('logout_error', e)
  }
  res.status(204).end()
}
