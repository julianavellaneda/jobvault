import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from '@libsql/client'
import { createDb, type Db } from './client'
import { LibsqlDataAdapter } from './adapter'
import type { NewApplication, NewPendingUrl } from '../adapter'
import type { ExtractedFields } from '@/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION = resolve(__dirname, 'migrations/0000_faulty_bloodscream.sql')

async function applyMigrations(client: Client) {
  const sql = await readFile(MIGRATION, 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean)
  for (const stmt of statements) {
    await client.execute(stmt)
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

describe('LibsqlDataAdapter', () => {
  let db: Db
  let client: Client
  let adapter: LibsqlDataAdapter
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'libsql-adapter-test-'))
    ;({ db, client } = createDb(`file:${join(tmpDir, 'app.db')}`))
    await applyMigrations(client)
    adapter = new LibsqlDataAdapter(db)
  })

  afterEach(async () => {
    client.close()
    await rm(tmpDir, { recursive: true, force: true })
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
    // no application leaked through the failed transaction
    expect(await adapter.listApplications()).toEqual([])
  })

  it('approvePending called twice with same id only inserts once', async () => {
    const [pending] = await adapter.createPendingUrls([newPending()])

    await adapter.approvePending(pending.id, newApp())
    await expect(adapter.approvePending(pending.id, newApp())).rejects.toThrow(/pending_not_found/)

    expect(await adapter.listApplications()).toHaveLength(1)
  })
})
