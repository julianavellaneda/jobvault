import { describe, expect, it } from 'vitest'
import type { Application, Status } from '@/types'
import { groupApps, sortApps } from './applicationsView'

function ts(date: Date): number {
  return date.getTime()
}

function app(partial: Partial<Application> & { id: string; status: Status }): Application {
  return {
    url: 'https://example.com',
    company: '',
    role: '',
    salary: '',
    location: '',
    workArrangement: '',
    source: '',
    tags: [],
    notes: '',
    deadline: null,
    followUpDate: null,
    appliedAt: null,
    createdAt: null,
    addedBy: 'u',
    addedByName: 'U',
    ...partial,
  }
}

describe('sortApps', () => {
  it('sorts by createdAt desc with nulls last', () => {
    const a = app({ id: 'a', status: 'pending', createdAt: ts(new Date('2026-01-01')) })
    const b = app({ id: 'b', status: 'pending', createdAt: ts(new Date('2026-03-01')) })
    const c = app({ id: 'c', status: 'pending', createdAt: null })
    const out = sortApps([a, b, c], 'createdAt', 'desc')
    expect(out.map(x => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by createdAt asc with nulls still last', () => {
    const a = app({ id: 'a', status: 'pending', createdAt: ts(new Date('2026-01-01')) })
    const b = app({ id: 'b', status: 'pending', createdAt: ts(new Date('2026-03-01')) })
    const c = app({ id: 'c', status: 'pending', createdAt: null })
    const out = sortApps([a, b, c], 'createdAt', 'asc')
    expect(out.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by deadline asc with nulls last', () => {
    const a = app({ id: 'a', status: 'pending', deadline: ts(new Date('2026-06-01')) })
    const b = app({ id: 'b', status: 'pending', deadline: ts(new Date('2026-05-01')) })
    const c = app({ id: 'c', status: 'pending', deadline: null })
    const out = sortApps([a, b, c], 'deadline', 'asc')
    expect(out.map(x => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by company A→Z with empty company last', () => {
    const a = app({ id: 'a', status: 'pending', company: 'Zenith' })
    const b = app({ id: 'b', status: 'pending', company: 'acme' })
    const c = app({ id: 'c', status: 'pending', company: '' })
    const out = sortApps([a, b, c], 'company', 'asc')
    expect(out.map(x => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('does not mutate input', () => {
    const a = app({ id: 'a', status: 'pending', createdAt: ts(new Date('2026-01-01')) })
    const b = app({ id: 'b', status: 'pending', createdAt: ts(new Date('2026-03-01')) })
    const input = [a, b]
    sortApps(input, 'createdAt', 'desc')
    expect(input.map(x => x.id)).toEqual(['a', 'b'])
  })
})

describe('groupApps', () => {
  it('returns a single "all" group for none', () => {
    const a = app({ id: 'a', status: 'pending' })
    const groups = groupApps([a], 'none')
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual([a])
  })

  it('groups by status in canonical order, drops empty buckets', () => {
    const a = app({ id: 'a', status: 'offer' })
    const b = app({ id: 'b', status: 'pending' })
    const c = app({ id: 'c', status: 'pending' })
    const groups = groupApps([a, b, c], 'status')
    expect(groups.map(g => g.key)).toEqual(['pending', 'offer'])
    expect(groups[0].items.map(x => x.id)).toEqual(['b', 'c'])
  })

  it('groups by source alphabetically, empty source last', () => {
    const a = app({ id: 'a', status: 'pending', source: 'LinkedIn' })
    const b = app({ id: 'b', status: 'pending', source: '' })
    const c = app({ id: 'c', status: 'pending', source: 'Greenhouse' })
    const groups = groupApps([a, b, c], 'source')
    expect(groups.map(g => g.label)).toEqual(['Greenhouse', 'LinkedIn', '(no source)'])
  })

  it('groups by month newest first', () => {
    const a = app({ id: 'a', status: 'pending', createdAt: ts(new Date('2026-01-15')) })
    const b = app({ id: 'b', status: 'pending', createdAt: ts(new Date('2026-03-10')) })
    const c = app({ id: 'c', status: 'pending', createdAt: null })
    const groups = groupApps([a, b, c], 'month')
    expect(groups[0].items.map(x => x.id)).toEqual(['b'])
    expect(groups[1].items.map(x => x.id)).toEqual(['a'])
    expect(groups[2].label).toBe('(no date)')
  })

  it('groups by month using local time, not UTC', () => {
    // 23:30 local on Jan 31 — in any timezone west of UTC this is still January locally,
    // but its UTC representation rolls over into February. Bucketing must follow local time.
    const local = new Date(2026, 0, 31, 23, 30, 0)
    const a = app({ id: 'a', status: 'pending', createdAt: ts(local) })
    const groups = groupApps([a], 'month')
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('2026-01')
  })

  it('preserves item order within groups (input order)', () => {
    const b = app({ id: 'b', status: 'pending' })
    const a = app({ id: 'a', status: 'pending' })
    const c = app({ id: 'c', status: 'pending' })
    const groups = groupApps([b, a, c], 'status')
    expect(groups[0].items.map(x => x.id)).toEqual(['b', 'a', 'c'])
  })
})
