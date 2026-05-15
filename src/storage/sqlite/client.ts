import type { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

export type Db = BunSQLiteDatabase<typeof schema>

export async function createDb(url: string): Promise<{ db: Db; client: Database }> {
  // Lazy-load so Node-based tooling (vitest, tsc) can import this module
  // without resolving `bun:sqlite`. The actual runtime is always Bun.
  const { Database: BunDatabase } = await import('bun:sqlite')
  const { drizzle } = await import('drizzle-orm/bun-sqlite')

  const path = parseDatabaseUrl(url)
  const client = new BunDatabase(path)
  if (path !== ':memory:') client.exec('PRAGMA journal_mode = WAL;')
  client.exec('PRAGMA foreign_keys = ON;')
  const db = drizzle(client, { schema }) as Db
  return { db, client }
}

export function parseDatabaseUrl(url: string): string {
  if (url === ':memory:') return ':memory:'
  if (url.startsWith('file:')) return url.slice('file:'.length).replace(/^\/\//, '')
  return url
}
