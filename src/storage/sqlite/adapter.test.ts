import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteDataAdapter } from './adapter'
import * as schema from './schema'
import type { Db } from './client'
import type { NewApplication, NewLocalUser, NewPendingUrl } from '../adapter'
import type { ExtractedFields } from '@/types'

// Tests run under Node-based vitest, where `bun:sqlite` is unavailable.
// `better-sqlite3` is the standard Node-side equivalent and shares Drizzle's
// `BaseSQLiteDatabase` shape, so the adapter is exercised against an identical
// query surface.

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = [
  resolve(__dirname, 'migrations/0000_faulty_bloodscream.sql'),
  resolve(__dirname, 'migrations/0001_acoustic_corsair.sql'),
  resolve(__dirname, 'migrations/0002_local_auth.sql'),
  resolve(__dirname, 'migrations/0003_rename_email_to_username.sql'),
  resolve(__dirname, 'migrations/0004_server_sessions.sql'),
]

async function applyMigrations(client: Database.Database) {
  for (const file of MIGRATIONS) {
    const sql = await readFile(file, 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      client.exec(stmt)
    }
  }
}

const EMPTY_EXTRACTED: ExtractedFields = {
  company: '',
  role: '',
  salary: '',
  location: '',
  workArrangement: '',
  source: '',
}

function newApp(overrides: Partial<NewApplication> = {}): NewApplication {
  return {
    url: 'https://example.com/job',
    company: 'Acme',
    role: 'Engineer',
    salary: '',
    location: '',
    workArrangement: '',
    source: '',
    tags: [],
    status: 'pending',
    notes: '',
    deadline: null,
    followUpDate: null,
    appliedAt: null,
    addedBy: 'u1',
    addedByName: 'User One',
    ...overrides,
  }
}

function newUser(overrides: Partial<NewLocalUser> = {}): NewLocalUser {
  return {
    username: 'admin',
    passwordHash: 'scrypt$1$AAAA$BBBB',
    role: 'admin',
    ...overrides,
  }
}

function newPending(overrides: Partial<NewPendingUrl> = {}): NewPendingUrl {
  return {
    url: 'https://example.com/job',
    hostname: 'example.com',
    extraction: 'idle',
    extracted: EMPTY_EXTRACTED,
    extractError: '',
    addedBy: 'u1',
    addedByName: 'User One',
    ...overrides,
  }
}

describe('SqliteDataAdapter', () => {
  let db: Db
  let client: Database.Database
  let adapter: SqliteDataAdapter

  beforeEach(async () => {
    client = new Database(':memory:')
    client.exec('PRAGMA foreign_keys = ON;')
    db = drizzle(client, { schema }) as unknown as Db
    await applyMigrations(client)
    adapter = new SqliteDataAdapter(db)
  })

  afterEach(() => {
    client.close()
  })

  it('create + list returns the row with assigned id and createdAt', async () => {
    const created = await adapter.createApplication(newApp({ company: 'Acme' }))
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.company).toBe('Acme')
    expect(typeof created.createdAt).toBe('number')

    const list = await adapter.listApplications()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
  })

  it('list orders applications by createdAt desc', async () => {
    const a = await adapter.createApplication(newApp({ company: 'A' }))
    await new Promise(r => setTimeout(r, 5))
    const b = await adapter.createApplication(newApp({ company: 'B' }))

    const list = await adapter.listApplications()
    expect(list.map(x => x.company)).toEqual(['B', 'A'])
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('updateApplication patches only provided fields', async () => {
    const created = await adapter.createApplication(newApp({ company: 'Acme' }))
    await adapter.updateApplication(created.id, { status: 'applied', appliedAt: 12345 })

    const [after] = await adapter.listApplications()
    expect(after.status).toBe('applied')
    expect(after.appliedAt).toBe(12345)
    expect(after.company).toBe('Acme')
  })

  it('updateApplication with empty patch is a no-op', async () => {
    const created = await adapter.createApplication(newApp())
    await adapter.updateApplication(created.id, {})
    const [after] = await adapter.listApplications()
    expect(after.id).toBe(created.id)
  })

  it('deleteApplication removes the row', async () => {
    const created = await adapter.createApplication(newApp())
    await adapter.deleteApplication(created.id)
    expect(await adapter.listApplications()).toEqual([])
  })

  it('createPendingUrls bulk inserts and round-trips JSON extracted field', async () => {
    const extracted: ExtractedFields = {
      ...EMPTY_EXTRACTED,
      company: 'Acme',
      role: 'SWE',
    }
    const created = await adapter.createPendingUrls([
      newPending({ url: 'https://a.com', extracted }),
      newPending({ url: 'https://b.com' }),
    ])
    expect(created).toHaveLength(2)

    const list = await adapter.listPendingUrls()
    expect(list).toHaveLength(2)
    const withFields = list.find(p => p.url === 'https://a.com')!
    expect(withFields.extracted.company).toBe('Acme')
    expect(withFields.extracted.role).toBe('SWE')
  })

  it('createPendingUrls with empty input is a no-op', async () => {
    const res = await adapter.createPendingUrls([])
    expect(res).toEqual([])
    expect(await adapter.listPendingUrls()).toEqual([])
  })

  it('approvePending atomically deletes pending and inserts application', async () => {
    const [pending] = await adapter.createPendingUrls([newPending({ url: 'https://x.com' })])

    const app = await adapter.approvePending(pending.id, newApp({ url: 'https://x.com' }))

    expect(await adapter.listPendingUrls()).toEqual([])
    const apps = await adapter.listApplications()
    expect(apps).toHaveLength(1)
    expect(apps[0].id).toBe(app.id)
    expect(apps[0].url).toBe('https://x.com')
  })

  it('approvePending throws and rolls back when pending row is missing', async () => {
    await expect(
      adapter.approvePending('does-not-exist', newApp()),
    ).rejects.toThrow(/pending_not_found/)
    expect(await adapter.listApplications()).toEqual([])
  })

  it('approvePending called twice with same id only inserts once', async () => {
    const [pending] = await adapter.createPendingUrls([newPending()])

    await adapter.approvePending(pending.id, newApp())
    await expect(adapter.approvePending(pending.id, newApp())).rejects.toThrow(/pending_not_found/)

    expect(await adapter.listApplications()).toHaveLength(1)
  })

  describe('user persistence', () => {
    it('createUser round-trips and normalizes username to lowercase', async () => {
      const u = await adapter.createUser(newUser({ username: '  Alex_01 ' }))
      expect(u.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(u.username).toBe('alex_01')
      expect(u.role).toBe('admin')
      expect(typeof u.createdAt).toBe('number')

      expect(await adapter.countUsers()).toBe(1)
      const byId = await adapter.findUserById(u.id)
      expect(byId?.username).toBe('alex_01')
      expect(byId?.passwordHash).toBe('scrypt$1$AAAA$BBBB')
    })

    it('findUserByUsername matches case-insensitively', async () => {
      await adapter.createUser(newUser({ username: 'alex' }))
      const found = await adapter.findUserByUsername('ALEX')
      expect(found?.username).toBe('alex')
      expect(await adapter.findUserByUsername('nobody')).toBeNull()
    })

    it('findUserById returns null for unknown id', async () => {
      expect(await adapter.findUserById('does-not-exist')).toBeNull()
    })

    it('createUser rejects duplicate usernames via the unique index', async () => {
      await adapter.createUser(newUser({ username: 'dup' }))
      await expect(adapter.createUser(newUser({ username: 'DUP' }))).rejects.toThrow()
      expect(await adapter.countUsers()).toBe(1)
    })

    it('createInitialUser inserts when empty and throws once any user exists', async () => {
      const first = await adapter.createInitialUser(newUser({ username: 'first' }))
      expect(first.username).toBe('first')
      expect(await adapter.countUsers()).toBe(1)

      await expect(
        adapter.createInitialUser(newUser({ username: 'second' })),
      ).rejects.toThrow(/setup_already_complete/)
      expect(await adapter.countUsers()).toBe(1)
    })
  })

  describe('session persistence', () => {
    it('createSession round-trips and deleteSession revokes', async () => {
      const u = await adapter.createUser(newUser())
      const s = await adapter.createSession({ userId: u.id, expiresAt: Date.now() + 60_000 })
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(await adapter.findSession(s.id)).toEqual(s)

      await adapter.deleteSession(s.id)
      expect(await adapter.findSession(s.id)).toBeNull()
    })

    it('deleteExpiredSessions removes only expired rows', async () => {
      const u = await adapter.createUser(newUser())
      const now = Date.now()
      const expired = await adapter.createSession({ userId: u.id, expiresAt: now - 1 })
      const live = await adapter.createSession({ userId: u.id, expiresAt: now + 60_000 })

      await adapter.deleteExpiredSessions(now)
      expect(await adapter.findSession(expired.id)).toBeNull()
      expect(await adapter.findSession(live.id)).not.toBeNull()
    })

    it('deleting a user cascades to their sessions (password-recovery path)', async () => {
      const u = await adapter.createUser(newUser())
      const s = await adapter.createSession({ userId: u.id, expiresAt: Date.now() + 60_000 })

      client.exec('DELETE FROM users')
      expect(await adapter.findSession(s.id)).toBeNull()
    })

    it('rejects a session for a user that does not exist', async () => {
      await expect(
        adapter.createSession({ userId: 'ghost', expiresAt: Date.now() + 60_000 }),
      ).rejects.toThrow()
    })
  })

  it('getAiSettings returns null until set, then upserts a single row', async () => {
    expect(await adapter.getAiSettings()).toBeNull()

    await adapter.setAiSettings({ provider: 'openai', apiKey: 'sk-abc', model: 'gpt-4o-mini' })
    const first = await adapter.getAiSettings()
    expect(first).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-abc',
      model: 'gpt-4o-mini',
      baseUrl: '',
    })
    expect(first?.updatedAt).toBeGreaterThan(0)

    // Second call upserts (does not insert a new row) and merges columns.
    await adapter.setAiSettings({ provider: 'anthropic' })
    const second = await adapter.getAiSettings()
    expect(second).toMatchObject({
      provider: 'anthropic',
      apiKey: 'sk-abc',
      model: 'gpt-4o-mini',
    })
    const rows = client.prepare('select count(*) as n from ai_settings').get() as { n: number }
    expect(rows.n).toBe(1)
  })
})
