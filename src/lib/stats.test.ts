import { describe, expect, it } from 'vitest'
import type { Application, Status } from '@/types'
import {
  appliedTodayCount,
  bySource,
  computeStreak,
  funnelCounts,
  pendingCount,
  statusCounts,
  submissionHeatmap,
  totalApplied,
} from './stats'

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

function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

describe('computeStreak', () => {
  it('returns 0 when nothing applied', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    const apps = [
      app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(0)) }),
      app({ id: '2', status: 'applied', appliedAt: ts(daysAgo(1)) }),
      app({ id: '3', status: 'applied', appliedAt: ts(daysAgo(2)) }),
    ]
    expect(computeStreak(apps)).toBe(3)
  })

  it('returns 0 when latest applied is yesterday (streak broken)', () => {
    const apps = [app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(1)) })]
    expect(computeStreak(apps)).toBe(0)
  })

  it('stops at first gap', () => {
    const apps = [
      app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(0)) }),
      app({ id: '2', status: 'applied', appliedAt: ts(daysAgo(2)) }),
    ]
    expect(computeStreak(apps)).toBe(1)
  })
})

describe('appliedTodayCount', () => {
  it('counts apps with appliedAt today', () => {
    const apps = [
      app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(0)) }),
      app({ id: '2', status: 'applied', appliedAt: ts(daysAgo(0)) }),
      app({ id: '3', status: 'applied', appliedAt: ts(daysAgo(1)) }),
      app({ id: '4', status: 'pending' }),
    ]
    expect(appliedTodayCount(apps)).toBe(2)
  })
})

describe('totalApplied', () => {
  it('counts non-pending applications', () => {
    const apps = [
      app({ id: '1', status: 'pending' }),
      app({ id: '2', status: 'applied' }),
      app({ id: '3', status: 'interview' }),
      app({ id: '4', status: 'rejected' }),
    ]
    expect(totalApplied(apps)).toBe(3)
  })
})

describe('funnelCounts', () => {
  it('rolls up the funnel', () => {
    const apps = [
      app({ id: '1', status: 'applied' }),
      app({ id: '2', status: 'applied' }),
      app({ id: '3', status: 'interview' }),
      app({ id: '4', status: 'offer' }),
      app({ id: '5', status: 'rejected' }),
    ]
    const out = funnelCounts(apps)
    expect(out).toEqual([
      { stage: 'Applied', count: 5 },
      { stage: 'Interview', count: 2 },
      { stage: 'Offer', count: 1 },
    ])
  })
})

describe('bySource', () => {
  it('groups and sorts descending by total', () => {
    const apps = [
      app({ id: '1', status: 'applied', source: 'LinkedIn' }),
      app({ id: '2', status: 'pending', source: 'LinkedIn' }),
      app({ id: '3', status: 'applied', source: 'Greenhouse' }),
    ]
    const out = bySource(apps)
    expect(out[0]).toEqual({ source: 'LinkedIn', total: 2, applied: 1 })
    expect(out[1]).toEqual({ source: 'Greenhouse', total: 1, applied: 1 })
  })

  it('falls back to "Unknown" for empty source', () => {
    const apps = [app({ id: '1', status: 'pending', source: '' })]
    expect(bySource(apps)[0].source).toBe('Unknown')
  })
})

describe('pendingCount', () => {
  it('counts only pending apps', () => {
    const apps = [
      app({ id: '1', status: 'pending' }),
      app({ id: '2', status: 'pending' }),
      app({ id: '3', status: 'applied' }),
    ]
    expect(pendingCount(apps)).toBe(2)
  })
})

describe('statusCounts', () => {
  it('returns exact counts per status including zeros', () => {
    const apps = [
      app({ id: '1', status: 'pending' }),
      app({ id: '2', status: 'pending' }),
      app({ id: '3', status: 'applied' }),
      app({ id: '4', status: 'interview' }),
      app({ id: '5', status: 'interview' }),
      app({ id: '6', status: 'rejected' }),
    ]
    const out = statusCounts(apps)
    expect(out.pending).toBe(2)
    expect(out.applied).toBe(1)
    expect(out.interview).toBe(2)
    expect(out.offer).toBe(0)
    expect(out.rejected).toBe(1)
  })

  it('returns all zeros for empty input', () => {
    const out = statusCounts([])
    expect(out).toEqual({ pending: 0, applied: 0, interview: 0, offer: 0, rejected: 0 })
  })
})

describe('submissionHeatmap', () => {
  it('returns a 7×weeks grid of zeros for empty apps', () => {
    const weeks = 4
    const grid = submissionHeatmap([], weeks)
    expect(grid.length).toBe(7)
    for (const row of grid) {
      expect(row.length).toBe(weeks)
      expect(row.every(v => v === 0)).toBe(true)
    }
  })

  it('places an app applied today into the last column at the correct weekday row', () => {
    const weeks = 4
    const today = daysAgo(0)
    const a = app({ id: '1', status: 'applied', appliedAt: ts(today) })
    const grid = submissionHeatmap([a], weeks)
    // last column is weeks-1
    const expectedCol = weeks - 1
    // Mon=0..Sun=6
    const expectedRow = (today.getDay() + 6) % 7
    expect(grid[expectedRow][expectedCol]).toBe(1)
    // total across grid should be exactly 1
    const total = grid.flat().reduce((s, v) => s + v, 0)
    expect(total).toBe(1)
  })

  it('ignores apps outside the window', () => {
    const weeks = 4
    // appliedAt is weeks*7 + 1 days ago — just outside the window
    const outsideApp = app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(weeks * 7 + 1)) })
    const grid = submissionHeatmap([outsideApp], weeks)
    const total = grid.flat().reduce((s, v) => s + v, 0)
    expect(total).toBe(0)
  })

  it('rows do not alias each other (mutating one row does not affect another)', () => {
    const weeks = 4
    const grid = submissionHeatmap([], weeks)
    grid[0][0] = 99
    expect(grid[1][0]).toBe(0)
  })
})
