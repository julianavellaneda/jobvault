import type { Client } from '@libsql/client'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDb, type Db } from '../../src/storage/libsql/client.js'
import { LibsqlDataAdapter } from '../../src/storage/libsql/adapter.js'
import type { DataAdapter } from '../../src/storage/adapter.js'

let cached: { adapter: DataAdapter; db: Db; client: Client } | null = null
let envLoaded = false

// `vercel dev` on a linked project pulls env from the cloud and ignores
// `.env.local`. For self-hosters running `vercel dev` (or any node serverless
// runner), fall back to loading `.env.local` from cwd if DATABASE_URL is unset.
function loadLocalEnv(): void {
  if (envLoaded) return
  envLoaded = true
  if (process.env.DATABASE_URL) return
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  try {
    process.loadEnvFile(path)
  } catch {
    // Node <20.6 — operators on older Node should set env via shell.
  }
}

export function getAdapter(): DataAdapter {
  if (cached) return cached.adapter
  loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined
  const { db, client } = createDb(url, authToken)
  const adapter = new LibsqlDataAdapter(db)
  cached = { adapter, db, client }
  return adapter
}
