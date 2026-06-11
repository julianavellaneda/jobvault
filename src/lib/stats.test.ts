import { describe, expect, it } from 'vitest'
import type { Application, Status } from '@/types'
import {
  appliedTodayCount,
  bySource,
  computeStreak,
  daysUntilDeadline,
  funnelCounts,
  pendingCount,
  rangeFilter,
  responseRate,
  statusCounts,
  submissionHeatmap,
  totalApplied,
  upcomingDeadlines,
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

  it('excludes an app applied exactly weeks*7 days ago (boundary)', () => {
    const weeks = 4
    const boundaryApp = app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(weeks * 7)) })
    const grid = submissionHeatmap([boundaryApp], weeks)
    expect(grid.flat().reduce((s, v) => s + v, 0)).toBe(0)
  })

  it('ignores an app with a future appliedAt (dayDiff < 0 guard)', () => {
    const weeks = 4
    const futureApp = app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(-3)) })
    const grid = submissionHeatmap([futureApp], weeks)
    expect(grid.flat().reduce((s, v) => s + v, 0)).toBe(0)
  })

  it('rows do not alias each other (mutating one row does not affect another)', () => {
    const weeks = 4
    const grid = submissionHeatmap([], weeks)
    grid[0][0] = 99
    expect(grid[1][0]).toBe(0)
  })
})

describe('rangeFilter', () => {
  it('"all" returns apps unchanged including null-anchor apps', () => {
    const apps = [
      app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(3)) }),
      app({ id: '2', status: 'pending', appliedAt: null, createdAt: null }),
    ]
    expect(rangeFilter(apps, 'all')).toHaveLength(2)
  })

  it('"7d" includes an app applied 3 days ago', () => {
    const apps = [app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(3)) })]
    expect(rangeFilter(apps, '7d')).toHaveLength(1)
  })

  it('"7d" excludes an app applied 10 days ago', () => {
    const apps = [app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(10)) })]
    expect(rangeFilter(apps, '7d')).toHaveLength(0)
  })

  it('"30d" includes an app applied 10 days ago', () => {
    const apps = [app({ id: '1', status: 'applied', appliedAt: ts(daysAgo(10)) })]
    expect(rangeFilter(apps, '30d')).toHaveLength(1)
  })

  it('windowed range excludes a both-dates-null app', () => {
    const apps = [app({ id: '1', status: 'pending', appliedAt: null, createdAt: null })]
    expect(rangeFilter(apps, '7d')).toHaveLength(0)
    expect(rangeFilter(apps, '30d')).toHaveLength(0)
  })

  it('falls back to createdAt anchor when appliedAt is null', () => {
    const apps = [
      app({ id: '1', status: 'pending', appliedAt: null, createdAt: ts(daysAgo(3)) }),
    ]
    expect(rangeFilter(apps, '7d')).toHaveLength(1)
  })
})

describe('upcomingDeadlines', () => {
  const DAY = 86_400_000
  const now = Date.now()

  it('excludes apps with null deadline', () => {
    const apps = [app({ id: '1', status: 'applied', deadline: null })]
    expect(upcomingDeadlines(apps, now)).toHaveLength(0)
  })

  it('excludes apps with a past deadline (deadline <= now)', () => {
    const apps = [app({ id: '1', status: 'applied', deadline: now - DAY })]
    expect(upcomingDeadlines(apps, now)).toHaveLength(0)
  })

  it('returns results sorted ascending by deadline', () => {
    const apps = [
      app({ id: 'b', status: 'applied', deadline: now + 5 * DAY }),
      app({ id: 'a', status: 'applied', deadline: now + 2 * DAY }),
      app({ id: 'c', status: 'applied', deadline: now + 10 * DAY }),
    ]
    const result = upcomingDeadlines(apps, now)
    expect(result.map(a => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('respects the limit parameter', () => {
    const apps = Array.from({ length: 6 }, (_, i) =>
      app({ id: String(i), status: 'applied', deadline: now + (i + 1) * DAY }),
    )
    expect(upcomingDeadlines(apps, now, 4)).toHaveLength(4)
  })
})

describe('daysUntilDeadline', () => {
  const DAY = 86_400_000
  const now = Date.now()

  it('returns the rounded number of days', () => {
    expect(daysUntilDeadline(now + 3 * DAY, now)).toBe(3)
    expect(daysUntilDeadline(now + 4 * DAY, now)).toBe(4)
  })

  it('returns 0 for a past deadline', () => {
    expect(daysUntilDeadline(now - DAY, now)).toBe(0)
  })
})

describe('responseRate', () => {
  it('returns the interview+offer count as a percentage of applied', () => {
    const apps = [
      app({ id: '1', status: 'applied' }),
      app({ id: '2', status: 'applied' }),
      app({ id: '3', status: 'interview' }),
      app({ id: '4', status: 'offer' }),
    ]
    // funnelCounts: Applied=4 (applied+interview+offer+rejected), Interview=2 (interview+offer)
    // 2/4 = 50%
    expect(responseRate(apps)).toBe(50)
  })

  it('returns 0 for empty apps', () => {
    expect(responseRate([])).toBe(0)
  })

  it('returns 0 when no apps have passed the applied stage', () => {
    const apps = [app({ id: '1', status: 'pending' })]
    expect(responseRate(apps)).toBe(0)
  })
})
