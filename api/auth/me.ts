import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSessionUser } from '../_lib/session.js'
import { methodNotAllowed } from '../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET'])
    return
  }
  const mode = (process.env.AUTH_MODE || 'none').toLowerCase()
  if (mode === 'none') {
    res.status(200).json({ uid: 'local', email: 'local@self-host', displayName: 'Local User' })
    return
  }
  const user = await readSessionUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  res.status(200).json(user)
}
