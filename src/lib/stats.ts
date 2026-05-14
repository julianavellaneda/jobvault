import type { Application, Status } from '@/types'

const RESPONDED_STATUSES: Status[] = ['applied', 'interview', 'offer', 'rejected']

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey(): string {
  return dayKey(new Date())
}

function appliedDate(a: Application): Date | null {
  return a.appliedAt != null ? new Date(a.appliedAt) : null
}

function createdDate(a: Application): Date | null {
  return a.createdAt != null ? new Date(a.createdAt) : null
}

export function computeStreak(apps: Application[]): number {
  const days = new Set<string>()
  for (const a of apps) {
    const d = appliedDate(a)
    if (d) days.add(dayKey(d))
  }
  if (days.size === 0) return 0
  let streak = 0
  const cursor = new Date()
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function appliedTodayCount(apps: Application[]): number {
  const today = todayKey()
  let n = 0
  for (const a of apps) {
    const d = appliedDate(a)
    if (d && dayKey(d) === today) n += 1
  }
  return n
}

export function totalApplied(apps: Application[]): number {
  return apps.filter(a => RESPONDED_STATUSES.includes(a.status)).length
}

export function dailyCounts(apps: Application[], days = 30): { date: string; count: number }[] {
  const buckets = new Map<string, number>()
  const end = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)
    buckets.set(dayKey(d), 0)
  }
  for (const a of apps) {
    const d = appliedDate(a)
    if (!d) continue
    const k = dayKey(d)
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({
    date: date.slice(5),
    count,
  }))
}

export function funnelCounts(apps: Application[]): { stage: string; count: number }[] {
  const counts: Record<Status, number> = {
    pending: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  }
  for (const a of apps) counts[a.status] += 1
  const applied = counts.applied + counts.interview + counts.offer + counts.rejected
  const interview = counts.interview + counts.offer
  const offer = counts.offer
  return [
    { stage: 'Applied', count: applied },
    { stage: 'Interview', count: interview },
    { stage: 'Offer', count: offer },
  ]
}

export function weekdayHeatmap(apps: Application[]): { day: string; count: number }[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const a of apps) {
    const d = appliedDate(a)
    if (d) counts[d.getDay()] += 1
  }
  return labels.map((day, i) => ({ day, count: counts[i] }))
}

export function bySource(apps: Application[]): { source: string; total: number; applied: number }[] {
  const map = new Map<string, { total: number; applied: number }>()
  for (const a of apps) {
    const key = a.source.trim() || 'Unknown'
    const cur = map.get(key) ?? { total: 0, applied: 0 }
    cur.total += 1
    if (RESPONDED_STATUSES.includes(a.status)) cur.applied += 1
    map.set(key, cur)
  }
  return Array.from(map.entries())
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.total - a.total)
}

export function byUser(apps: Application[]): { name: string; added: number; applied: number }[] {
  const map = new Map<string, { added: number; applied: number }>()
  for (const a of apps) {
    const key = a.addedByName || 'Unknown'
    const cur = map.get(key) ?? { added: 0, applied: 0 }
    cur.added += 1
    if (RESPONDED_STATUSES.includes(a.status)) cur.applied += 1
    map.set(key, cur)
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.added - a.added)
}

export function backlogBurndown(apps: Application[], days = 30): { date: string; backlog: number }[] {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const points: { date: string; backlog: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const cursor = new Date(end)
    cursor.setDate(end.getDate() - i)
    let pendingAtCursor = 0
    for (const a of apps) {
      const created = createdDate(a)
      if (!created || created > cursor) continue
      const applied = appliedDate(a)
      if (a.status === 'pending') {
        pendingAtCursor += 1
      } else if (applied && applied > cursor) {
        pendingAtCursor += 1
      }
    }
    points.push({ date: dayKey(cursor).slice(5), backlog: pendingAtCursor })
  }
  return points
}

export function pendingCount(apps: Application[]): number {
  return apps.filter(a => a.status === 'pending').length
}
