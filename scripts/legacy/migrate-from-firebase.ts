#!/usr/bin/env bun
/**
 * Firestore → SQLite one-shot migration. Legacy: kept for anyone moving off
 * an existing Firestore-backed Jules tracker into the new SQLite backend.
 * Not part of the regular runtime — `firebase-admin` is intentionally not a
 * project dependency.
 *
 * Usage:
 *   bun add -d firebase-admin
 *   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... \
 *   DATABASE_URL=file:./data/app.db \
 *   bun run scripts/legacy/migrate-from-firebase.ts [--dry-run]
 *
 * Idempotent: re-runs use INSERT OR IGNORE on the `id` / `email` primary key.
 * Make sure migrations are applied (start the server once or run drizzle-kit).
 */
// @ts-expect-error firebase-admin is an optional opt-in install for this script.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
// @ts-expect-error firebase-admin is optional.
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { createDb } from '../../src/storage/sqlite/client.ts'
import { allowlist, applications, pendingUrls } from '../../src/storage/sqlite/schema.ts'
import type { ExtractedFields, PendingExtractStatus, Status, WorkArrangement } from '../../src/types.ts'

const dryRun = process.argv.includes('--dry-run')

function getAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }
  return { db: getFirestore() }
}

function tsToMs(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number') return v
  return null
}

function requireMs(v: unknown, fallback = Date.now()): number {
  const ms = tsToMs(v)
  return ms ?? fallback
}

async function main() {
  const { db: fsDb } = getAdmin()
  const url = process.env.DATABASE_URL ?? 'file:./data/app.db'
  const { db, client } = await createDb(url)

  const appsSnap = await fsDb.collection('applications').get()
  const appRows: (typeof applications.$inferInsert)[] = appsSnap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => {
    const d = doc.data()
    return {
      id: doc.id,
      url: (d.url as string) ?? '',
      company: (d.company as string) ?? '',
      role: (d.role as string) ?? '',
      salary: (d.salary as string) ?? '',
      location: (d.location as string) ?? '',
      workArrangement: (d.workArrangement ?? '') as WorkArrangement,
      source: (d.source as string) ?? '',
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
      status: ((d.status as string) ?? 'pending') as Status,
      notes: (d.notes as string) ?? '',
      deadline: tsToMs(d.deadline),
      followUpDate: tsToMs(d.followUpDate),
      appliedAt: tsToMs(d.appliedAt),
      createdAt: requireMs(d.createdAt),
      addedBy: (d.addedBy as string) ?? '',
      addedByName: (d.addedByName as string) ?? '',
    }
  })

  const pendSnap = await fsDb.collection('pendingUrls').get()
  const pendRows: (typeof pendingUrls.$inferInsert)[] = pendSnap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => {
    const d = doc.data()
    const ex = (d.extracted ?? {}) as Partial<ExtractedFields>
    return {
      id: doc.id,
      url: (d.url as string) ?? '',
      hostname: (d.hostname as string) ?? '',
      extraction: ((d.extraction as string) ?? 'idle') as PendingExtractStatus,
      extracted: {
        company: ex.company ?? '',
        role: ex.role ?? '',
        salary: ex.salary ?? '',
        location: ex.location ?? '',
        workArrangement: (ex.workArrangement ?? '') as WorkArrangement,
        source: ex.source ?? '',
      },
      extractError: (d.extractError as string) ?? '',
      addedBy: (d.addedBy as string) ?? '',
      addedByName: (d.addedByName as string) ?? '',
      createdAt: requireMs(d.createdAt),
    }
  })

  const allowSnap = await fsDb.collection('allowlist').get()
  const allowRows: (typeof allowlist.$inferInsert)[] = allowSnap.docs.map((doc: { id: string; createTime: unknown }) => ({
    email: doc.id,
    createdAt: requireMs(doc.createTime),
  }))

  console.log(`Firestore export:`)
  console.log(`  applications: ${appRows.length}`)
  console.log(`  pendingUrls:  ${pendRows.length}`)
  console.log(`  allowlist:    ${allowRows.length}`)

  if (dryRun) {
    console.log('\n--dry-run set — printing sample rows and exiting.\n')
    if (appRows[0]) console.log('sample application:', appRows[0])
    if (pendRows[0]) console.log('sample pending:', pendRows[0])
    if (allowRows[0]) console.log('sample allowlist:', allowRows[0])
    client.close()
    return
  }

  console.log('\nWriting to SQLite...')
  db.transaction(tx => {
    if (appRows.length) tx.insert(applications).values(appRows).onConflictDoNothing().run()
    if (pendRows.length) tx.insert(pendingUrls).values(pendRows).onConflictDoNothing().run()
    if (allowRows.length) tx.insert(allowlist).values(allowRows).onConflictDoNothing().run()
  })
  console.log('Done.')
  client.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
