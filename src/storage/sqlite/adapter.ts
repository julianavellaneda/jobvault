import { desc, eq } from 'drizzle-orm'
import type { AiSettingsRow, Application, PendingUrl } from '@/types'
import type { DataAdapter, NewApplication, NewPendingUrl } from '../adapter'
import type { Db } from './client'
import { aiSettings, allowlist, applications, pendingUrls } from './schema'

const AI_SETTINGS_ID = 'singleton'

type AppRow = typeof applications.$inferSelect
type PendingRow = typeof pendingUrls.$inferSelect

function rowToApp(r: AppRow): Application {
  return {
    id: r.id,
    url: r.url,
    company: r.company,
    role: r.role,
    salary: r.salary,
    location: r.location,
    workArrangement: r.workArrangement,
    source: r.source,
    tags: r.tags,
    status: r.status,
    notes: r.notes,
    deadline: r.deadline,
    followUpDate: r.followUpDate,
    appliedAt: r.appliedAt,
    createdAt: r.createdAt,
    addedBy: r.addedBy,
    addedByName: r.addedByName,
  }
}

function rowToPending(r: PendingRow): PendingUrl {
  return {
    id: r.id,
    url: r.url,
    hostname: r.hostname,
    extraction: r.extraction,
    extracted: r.extracted,
    extractError: r.extractError,
    addedBy: r.addedBy,
    addedByName: r.addedByName,
    createdAt: r.createdAt,
  }
}

function appPatchToColumns(patch: Partial<Application>): Partial<typeof applications.$inferInsert> {
  const out: Partial<typeof applications.$inferInsert> = {}
  if (patch.url !== undefined) out.url = patch.url
  if (patch.company !== undefined) out.company = patch.company
  if (patch.role !== undefined) out.role = patch.role
  if (patch.salary !== undefined) out.salary = patch.salary
  if (patch.location !== undefined) out.location = patch.location
  if (patch.workArrangement !== undefined) out.workArrangement = patch.workArrangement
  if (patch.source !== undefined) out.source = patch.source
  if (patch.tags !== undefined) out.tags = patch.tags
  if (patch.status !== undefined) out.status = patch.status
  if (patch.notes !== undefined) out.notes = patch.notes
  if (patch.deadline !== undefined) out.deadline = patch.deadline
  if (patch.followUpDate !== undefined) out.followUpDate = patch.followUpDate
  if (patch.appliedAt !== undefined) out.appliedAt = patch.appliedAt
  if (patch.addedBy !== undefined) out.addedBy = patch.addedBy
  if (patch.addedByName !== undefined) out.addedByName = patch.addedByName
  return out
}

function pendingPatchToColumns(patch: Partial<PendingUrl>): Partial<typeof pendingUrls.$inferInsert> {
  const out: Partial<typeof pendingUrls.$inferInsert> = {}
  if (patch.url !== undefined) out.url = patch.url
  if (patch.hostname !== undefined) out.hostname = patch.hostname
  if (patch.extraction !== undefined) out.extraction = patch.extraction
  if (patch.extracted !== undefined) out.extracted = patch.extracted
  if (patch.extractError !== undefined) out.extractError = patch.extractError
  if (patch.addedBy !== undefined) out.addedBy = patch.addedBy
  if (patch.addedByName !== undefined) out.addedByName = patch.addedByName
  return out
}

export class SqliteDataAdapter implements DataAdapter {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async listApplications(): Promise<Application[]> {
    const rows = await this.db.select().from(applications).orderBy(desc(applications.createdAt))
    return rows.map(rowToApp)
  }

  async getApplication(id: string): Promise<Application | null> {
    const rows = await this.db.select().from(applications).where(eq(applications.id, id)).limit(1)
    return rows[0] ? rowToApp(rows[0]) : null
  }

  async createApplication(input: NewApplication): Promise<Application> {
    const row: typeof applications.$inferInsert = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    await this.db.insert(applications).values(row)
    return rowToApp(row as AppRow)
  }

  async updateApplication(id: string, patch: Partial<Application>): Promise<void> {
    const cols = appPatchToColumns(patch)
    if (Object.keys(cols).length === 0) return
    await this.db.update(applications).set(cols).where(eq(applications.id, id))
  }

  async deleteApplication(id: string): Promise<void> {
    await this.db.delete(applications).where(eq(applications.id, id))
  }

  async listPendingUrls(): Promise<PendingUrl[]> {
    const rows = await this.db.select().from(pendingUrls).orderBy(desc(pendingUrls.createdAt))
    return rows.map(rowToPending)
  }

  async createPendingUrls(inputs: NewPendingUrl[]): Promise<PendingUrl[]> {
    if (inputs.length === 0) return []
    const now = Date.now()
    const rows: (typeof pendingUrls.$inferInsert)[] = inputs.map(i => ({
      ...i,
      id: crypto.randomUUID(),
      createdAt: now,
    }))
    await this.db.insert(pendingUrls).values(rows)
    return rows.map(r => rowToPending(r as PendingRow))
  }

  async updatePendingUrl(id: string, patch: Partial<PendingUrl>): Promise<void> {
    const cols = pendingPatchToColumns(patch)
    if (Object.keys(cols).length === 0) return
    await this.db.update(pendingUrls).set(cols).where(eq(pendingUrls.id, id))
  }

  async deletePendingUrl(id: string): Promise<void> {
    await this.db.delete(pendingUrls).where(eq(pendingUrls.id, id))
  }

  async approvePending(pendingId: string, application: NewApplication): Promise<Application> {
    const row: typeof applications.$inferInsert = {
      ...application,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    this.db.transaction(tx => {
      const deleted = tx
        .delete(pendingUrls)
        .where(eq(pendingUrls.id, pendingId))
        .returning({ id: pendingUrls.id })
        .all()
      if (deleted.length === 0) {
        throw new Error(`pending_not_found: ${pendingId}`)
      }
      tx.insert(applications).values(row).run()
    })
    return rowToApp(row as AppRow)
  }

  async listAllowedEmails(): Promise<string[]> {
    const rows = await this.db.select({ email: allowlist.email }).from(allowlist)
    return rows.map(r => r.email)
  }

  async getAiSettings(): Promise<AiSettingsRow | null> {
    const rows = await this.db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.id, AI_SETTINGS_ID))
      .limit(1)
    const r = rows[0]
    if (!r) return null
    return {
      provider: r.provider,
      apiKey: r.apiKey,
      model: r.model,
      baseUrl: r.baseUrl,
      updatedAt: r.updatedAt,
    }
  }

  async setAiSettings(patch: Partial<Omit<AiSettingsRow, 'updatedAt'>>): Promise<void> {
    const cols: Partial<typeof aiSettings.$inferInsert> = {}
    if (patch.provider !== undefined) cols.provider = patch.provider
    if (patch.apiKey !== undefined) cols.apiKey = patch.apiKey
    if (patch.model !== undefined) cols.model = patch.model
    if (patch.baseUrl !== undefined) cols.baseUrl = patch.baseUrl
    const updatedAt = Date.now()
    await this.db
      .insert(aiSettings)
      .values({ id: AI_SETTINGS_ID, ...cols, updatedAt })
      .onConflictDoUpdate({
        target: aiSettings.id,
        set: { ...cols, updatedAt },
      })
  }
}
