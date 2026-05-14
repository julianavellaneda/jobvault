#!/usr/bin/env bun
/**
 * Firestore → libSQL one-shot migration.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... \
 *   DATABASE_URL=file:./data/app.db \
 *   bun run scripts/migrate-from-firebase.ts [--dry-run]
 *
 * Idempotent: re-runs INSERT OR IGNORE on the `id` / `email` primary key.
 * The local DB must already be migrated (`bunx drizzle-kit migrate`).
 */
import { Timestamp } from 'firebase-admin/firestore'
import { getAdmin } from '../api/_lib/firebaseAdmin'
import { createDb } from '../src/storage/libsql/client'
import { allowlist, applications, pendingUrls } from '../src/storage/libsql/schema'
import type { ExtractedFields, PendingExtractStatus, Status, WorkArrangement } from '../src/types'

const dryRun = process.argv.includes('--dry-run')

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
  const { db, client } = createDb(url, process.env.DATABASE_AUTH_TOKEN)

  // --- applications ---
  const appsSnap = await fsDb.collection('applications').get()
  const appRows: (typeof applications.$inferInsert)[] = appsSnap.docs.map(doc => {
    const d = doc.data()
    const ex = (d.extracted ?? {}) as Record<string, unknown>
    void ex
    return {
      id: doc.id,
      url: d.url ?? '',
      company: d.company ?? '',
      role: d.role ?? '',
      salary: d.salary ?? '',
      location: d.location ?? '',
      workArrangement: (d.workArrangement ?? '') as WorkArrangement,
      source: d.source ?? '',
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
      status: (d.status ?? 'pending') as Status,
      notes: d.notes ?? '',
      deadline: tsToMs(d.deadline),
      followUpDate: tsToMs(d.followUpDate),
      appliedAt: tsToMs(d.appliedAt),
      createdAt: requireMs(d.createdAt),
      addedBy: d.addedBy ?? '',
      addedByName: d.addedByName ?? '',
    }
  })

  // --- pendingUrls ---
  const pendSnap = await fsDb.collection('pendingUrls').get()
  const pendRows: (typeof pendingUrls.$inferInsert)[] = pendSnap.docs.map(doc => {
    const d = doc.data()
    const ex = (d.extracted ?? {}) as Partial<ExtractedFields>
    return {
      id: doc.id,
      url: d.url ?? '',
      hostname: d.hostname ?? '',
      extraction: (d.extraction ?? 'idle') as PendingExtractStatus,
      extracted: {
        company: ex.company ?? '',
        role: ex.role ?? '',
        salary: ex.salary ?? '',
        location: ex.location ?? '',
        workArrangement: (ex.workArrangement ?? '') as WorkArrangement,
        source: ex.source ?? '',
      },
      extractError: d.extractError ?? '',
      addedBy: d.addedBy ?? '',
      addedByName: d.addedByName ?? '',
      createdAt: requireMs(d.createdAt),
    }
  })

  // --- allowlist ---
  const allowSnap = await fsDb.collection('allowlist').get()
  const allowRows: (typeof allowlist.$inferInsert)[] = allowSnap.docs.map(doc => ({
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

  console.log('\nWriting to libSQL...')
  await db.transaction(async tx => {
    if (appRows.length) await tx.insert(applications).values(appRows).onConflictDoNothing()
    if (pendRows.length) await tx.insert(pendingUrls).values(pendRows).onConflictDoNothing()
    if (allowRows.length) await tx.insert(allowlist).values(allowRows).onConflictDoNothing()
  })
  console.log('Done.')
  client.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
