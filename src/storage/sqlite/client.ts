import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

// Nominal type chosen against the Bun driver. The better-sqlite3 driver shares
// Drizzle's `BaseSQLiteDatabase` shape, so adapter code calls the same query
// API on both — the runtime cast in `createDb` for non-Bun is safe and matches
// the precedent in adapter.test.ts (`drizzle(client) as unknown as Db`).
export type Db = BunSQLiteDatabase<typeof schema>

// The two driver-specific Database handles share no useful surface for us
// beyond construction, so we erase the type at the client boundary.
export type SqliteClient = { close?: () => void } & Record<string, unknown>

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
}

export async function createDb(url: string): Promise<{ db: Db; client: SqliteClient }> {
  const path = parseDatabaseUrl(url)

  if (isBunRuntime()) {
    const { Database: BunDatabase } = await import('bun:sqlite')
    const { drizzle } = await import('drizzle-orm/bun-sqlite')
    const client = new BunDatabase(path)
    if (path !== ':memory:') client.exec('PRAGMA journal_mode = WAL;')
    client.exec('PRAGMA foreign_keys = ON;')
    const db = drizzle(client, { schema }) as Db
    return { db, client: client as unknown as SqliteClient }
  }

  // Node (or any non-Bun) runtime: better-sqlite3.
  const { default: BetterDatabase } = await import('better-sqlite3')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const client = new BetterDatabase(path)
  if (path !== ':memory:') client.pragma('journal_mode = WAL')
  client.pragma('foreign_keys = ON')
  const db = drizzle(client, { schema }) as unknown as Db
  return { db, client: client as unknown as SqliteClient }
}

export function parseDatabaseUrl(url: string): string {
  if (url === ':memory:') return ':memory:'
  if (url.startsWith('file:')) return url.slice('file:'.length).replace(/^\/\//, '')
  return url
}
