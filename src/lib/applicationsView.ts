import type { Application, Status } from '@/types'
import { STATUSES, STATUS_LABELS } from '@/types'

export type GroupBy = 'none' | 'status' | 'source' | 'month'
export type SortBy = 'createdAt' | 'appliedAt' | 'deadline' | 'company'
export type SortDir = 'asc' | 'desc'

export const GROUP_BY_VALUES: GroupBy[] = ['none', 'status', 'source', 'month']
export const SORT_BY_VALUES: SortBy[] = ['createdAt', 'appliedAt', 'deadline', 'company']
export const SORT_DIR_VALUES: SortDir[] = ['asc', 'desc']

export interface AppGroup {
  key: string
  label: string
  items: Application[]
}

const NO_SOURCE = '__none__'
const NO_DATE = '__none__'

function localYearMonth(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${m < 10 ? '0' : ''}${m}`
}

export function sortApps(apps: Application[], sortBy: SortBy, dir: SortDir): Application[] {
  const mul = dir === 'asc' ? 1 : -1
  const copy = apps.slice()
  copy.sort((a, b) => {
    if (sortBy === 'company') {
      const av = a.company.trim().toLowerCase()
      const bv = b.company.trim().toLowerCase()
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      if (av < bv) return -1 * mul
      if (av > bv) return 1 * mul
      return 0
    }
    const av =
      sortBy === 'createdAt'
        ? a.createdAt
        : sortBy === 'appliedAt'
          ? a.appliedAt
          : a.deadline
    const bv =
      sortBy === 'createdAt'
        ? b.createdAt
        : sortBy === 'appliedAt'
          ? b.appliedAt
          : b.deadline
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * mul
  })
  return copy
}

export function groupApps(apps: Application[], groupBy: GroupBy): AppGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All', items: apps }]
  }

  if (groupBy === 'status') {
    const buckets = new Map<Status, Application[]>(STATUSES.map(s => [s, [] as Application[]]))
    for (const a of apps) buckets.get(a.status)!.push(a)
    return STATUSES
      .map(s => ({ key: s, label: STATUS_LABELS[s], items: buckets.get(s)! }))
      .filter(g => g.items.length > 0)
  }

  if (groupBy === 'source') {
    const buckets = new Map<string, Application[]>()
    for (const a of apps) {
      const key = a.source.trim() || NO_SOURCE
      const arr = buckets.get(key) ?? []
      arr.push(a)
      buckets.set(key, arr)
    }
    const keys = Array.from(buckets.keys())
    keys.sort((a, b) => {
      if (a === NO_SOURCE) return 1
      if (b === NO_SOURCE) return -1
      return a.localeCompare(b)
    })
    return keys.map(k => ({
      key: k,
      label: k === NO_SOURCE ? '(no source)' : k,
      items: buckets.get(k)!,
    }))
  }

  // month — by createdAt year-month in the user's local timezone, newest first
  const buckets = new Map<string, Application[]>()
  for (const a of apps) {
    const m = a.createdAt
    const key = m == null ? NO_DATE : localYearMonth(new Date(m))
    const arr = buckets.get(key) ?? []
    arr.push(a)
    buckets.set(key, arr)
  }
  const keys = Array.from(buckets.keys())
  keys.sort((a, b) => {
    if (a === NO_DATE) return 1
    if (b === NO_DATE) return -1
    return b.localeCompare(a)
  })
  const fmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' })
  return keys.map(k => ({
    key: k,
    label: k === NO_DATE ? '(no date)' : fmt.format(new Date(`${k}-01T00:00:00`)),
    items: buckets.get(k)!,
  }))
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function formatShortDate(t: number | null): string {
  if (t == null) return ''
  return SHORT_DATE_FMT.format(new Date(t))
}

export function parseGroupBy(v: string | null): GroupBy {
  return (GROUP_BY_VALUES as string[]).includes(v ?? '') ? (v as GroupBy) : 'none'
}
export function parseSortBy(v: string | null): SortBy {
  return (SORT_BY_VALUES as string[]).includes(v ?? '') ? (v as SortBy) : 'createdAt'
}
export function parseSortDir(v: string | null): SortDir {
  return (SORT_DIR_VALUES as string[]).includes(v ?? '') ? (v as SortDir) : 'desc'
}

export function defaultSortDir(sortBy: SortBy): SortDir {
  return sortBy === 'deadline' || sortBy === 'company' ? 'asc' : 'desc'
}
