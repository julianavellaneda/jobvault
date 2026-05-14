import { getAdapter } from './db.js'

function envList(): string[] | null {
  const raw = process.env.ALLOWLIST
  if (raw === undefined) return null
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

// Returns true if `email` is permitted to use the app.
// Policy:
//   1. If ALLOWLIST env is set, it wins. Empty value (after trim/split) = allow anyone signed in.
//   2. Otherwise, fall back to the SQL `allowlist` table. Empty table = allow anyone signed in.
export async function isAllowed(email: string): Promise<boolean> {
  const target = email.trim().toLowerCase()
  if (!target) return false
  const env = envList()
  if (env !== null) {
    return env.length === 0 || env.includes(target)
  }
  const list = (await getAdapter().listAllowedEmails()).map(e => e.toLowerCase())
  return list.length === 0 || list.includes(target)
}
