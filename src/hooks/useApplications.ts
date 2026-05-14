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
import type { Application, Status, WorkArrangement } from '@/types'

function tsToMs(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number') return v
  return null
}

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): Application {
  const d = snap.data()
  return {
    id: snap.id,
    url: d.url ?? '',
    company: d.company ?? '',
    role: d.role ?? '',
    salary: d.salary ?? '',
    location: d.location ?? '',
    workArrangement: (d.workArrangement ?? '') as WorkArrangement,
    source: d.source ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    status: (d.status ?? 'pending') as Status,
    notes: d.notes ?? '',
    deadline: tsToMs(d.deadline),
    followUpDate: tsToMs(d.followUpDate),
    appliedAt: tsToMs(d.appliedAt),
    createdAt: tsToMs(d.createdAt),
    addedBy: d.addedBy ?? '',
    addedByName: d.addedByName ?? '',
  }
}

export function useApplications() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'applications'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setApps(snap.docs.map(fromDoc))
        setLoading(false)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { apps, loading, error }
}
