import { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/firebase'
import type { ExtractedFields, PendingExtractStatus, PendingUrl, WorkArrangement } from '@/types'

function tsToMs(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number') return v
  return null
}

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): PendingUrl {
  const d = snap.data()
  const ex = (d.extracted ?? {}) as Partial<ExtractedFields>
  return {
    id: snap.id,
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
    createdAt: tsToMs(d.createdAt),
  }
}

export function usePendingUrls() {
  const [pending, setPending] = useState<PendingUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'pendingUrls'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setPending(snap.docs.map(fromDoc))
        setLoading(false)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { pending, loading, error }
}
