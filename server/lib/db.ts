import { existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import {
  createDb,
  parseDatabaseUrl,
  type Db,
  type SqliteClient,
} from '../../src/storage/sqlite/client.ts'
import { SqliteDataAdapter } from '../../src/storage/sqlite/adapter.ts'
import type { DataAdapter } from '../../src/storage/adapter.ts'

let cached: { adapter: DataAdapter; db: Db; client: SqliteClient } | null = null
let envLoaded = false
let migrated = false

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
}

function loadLocalEnv(): void {
  if (envLoaded) return
  envLoaded = true
  if (process.env.DATABASE_URL) return
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  try {
    process.loadEnvFile(path)
  } catch {
    // Node <20.6 — set env via shell instead.
  }
}

function ensureLocalDir(url: string): void {
  const path = parseDatabaseUrl(url)
  if (path === ':memory:') return
  const dir = dirname(resolve(path))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function migrationsFolder(): string {
  return process.env.MIGRATIONS_FOLDER || 'src/storage/sqlite/migrations'
}

async function runMigrations(db: Db): Promise<void> {
  if (isBunRuntime()) {
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')
    migrate(db as never, { migrationsFolder: migrationsFolder() })
    return
  }
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db as never, { migrationsFolder: migrationsFolder() })
}

export async function getAdapter(): Promise<DataAdapter> {
  if (cached) return cached.adapter
  loadLocalEnv()
  const url = process.env.DATABASE_URL || 'file:./data/app.db'
  ensureLocalDir(url)
  const { db, client } = await createDb(url)
  if (!migrated) {
    await runMigrations(db)
    migrated = true
  }
  const adapter = new SqliteDataAdapter(db)
  cached = { adapter, db, client }
  return adapter
}

export function _setAdapterForTesting(adapter: DataAdapter | null): void {
  if (adapter === null) {
    cached = null
  } else {
    cached = {
      adapter,
      db: null as unknown as Db,
      client: null as unknown as SqliteClient,
    }
  }
}
