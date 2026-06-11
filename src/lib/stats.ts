import type { Application, Status } from '@/types'

export type DashRange = '7d' | '30d' | 'all'

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

export function rangeFilter(apps: Application[], range: DashRange): Application[] {
  if (range === 'all') return apps
  const ms = range === '7d' ? 7 * 86_400_000 : 30 * 86_400_000
  const cutoff = Date.now() - ms
  return apps.filter(a => {
    const anchor = a.appliedAt ?? a.createdAt
    return anchor != null && anchor >= cutoff
  })
}

export function upcomingDeadlines(apps: Application[], now: number, limit = 4): Application[] {
  return apps
    .filter(a => a.deadline != null && a.deadline > now)
    .sort((a, b) => a.deadline! - b.deadline!)
    .slice(0, limit)
}

export function daysUntilDeadline(deadline: number, now: number): number {
  return Math.max(0, Math.round((deadline - now) / 86_400_000))
}

export function responseRate(apps: Application[]): number {
  const funnel = funnelCounts(apps)
  const applied = funnel.find(f => f.stage === 'Applied')?.count ?? 0
  const responded = funnel.find(f => f.stage === 'Interview')?.count ?? 0
  return applied === 0 ? 0 : Math.round((responded / applied) * 100)
}

export function pendingCount(apps: Application[]): number {
  return apps.filter(a => a.status === 'pending').length
}

export function statusCounts(apps: Application[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    pending: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  }
  for (const a of apps) counts[a.status] += 1
  return counts
}

// Buckets are rolling 7-day windows ending today (by daysAgo // 7), not
// calendar-aligned weeks — simpler and deterministic.
export function submissionHeatmap(apps: Application[], weeks = 16): number[][] {
  // 7 rows (Mon=0 … Sun=6) × weeks cols (col 0 = oldest, col weeks-1 = current)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(weeks).fill(0))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const a of apps) {
    if (a.appliedAt == null) continue
    const applied = new Date(a.appliedAt)
    applied.setHours(0, 0, 0, 0)
    const dayDiff = Math.floor((today.getTime() - applied.getTime()) / 86_400_000)
    if (dayDiff < 0) continue
    const weekFromEnd = Math.floor(dayDiff / 7)
    if (weekFromEnd >= weeks) continue
    const col = weeks - 1 - weekFromEnd
    // JS: Sun=0..Sat=6 → Mon=0..Sun=6
    const row = (applied.getDay() + 6) % 7
    grid[row][col] += 1
  }

  return grid
}
