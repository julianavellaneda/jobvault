import { useState } from 'react'
import { Clock, Flame, Send, Target, TrendingUp } from 'lucide-react'
import type { Application } from '@/types'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Monogram } from '@/components/ui/Monogram'
import { StatusPill } from '@/components/ui/StatusPill'
import {
  ActivityChart,
  BarList,
  Donut,
  FunnelChart,
  Heatmap,
} from '@/components/charts'
import {
  appliedTodayCount,
  bySource,
  byUser,
  computeStreak,
  daysUntilDeadline,
  rangeFilter,
  responseRate,
  totalApplied,
  upcomingDeadlines,
} from '@/lib/stats'
import type { DashRange } from '@/lib/stats'
import { cn } from '@/lib/utils'

export function Dashboard({ apps }: { apps: Application[] }) {
  const [range, setRange] = useState<DashRange>('30d')
  // Capture now once at mount — used for deadline comparisons; stable across re-renders
  const [now] = useState(() => Date.now())

  const scoped = rangeFilter(apps, range)

  // streak and deadlines use the full list — they are always current/forward-looking
  // and should not be clipped by the activity range selector
  const streak = computeStreak(apps)
  const deadlines = upcomingDeadlines(apps, now, 4)

  const today = appliedTodayCount(scoped)
  const pipeline = scoped.filter(
    a => a.status === 'applied' || a.status === 'interview' || a.status === 'offer',
  ).length
  const interviews = scoped.filter(a => a.status === 'interview').length
  const rate = responseRate(scoped)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Your job search at a glance — momentum, pipeline, and what needs attention.
          </p>
        </div>
        <SegmentedControl
          value={range}
          onChange={setRange}
          options={[
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          accent
          icon={<Flame />}
          label="Current streak"
          value={streak}
          unit=" days"
        />
        <StatCard
          icon={<Send />}
          label="Applied today"
          value={today}
        />
        <StatCard
          icon={<Target />}
          label="In pipeline"
          value={pipeline}
          subtitle={`${interviews} ${interviews === 1 ? 'interview' : 'interviews'} active`}
        />
        <StatCard
          icon={<TrendingUp />}
          label="Response rate"
          value={rate}
          unit="%"
        />
      </div>

      {/* Activity + Pipeline row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Application activity</CardTitle>
              <span className="text-sm tabular-nums text-[var(--color-muted-foreground)]">
                {totalApplied(scoped)} applied
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ActivityChart apps={scoped} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pipeline</CardTitle>
              <span className="text-sm text-[var(--color-muted-foreground)]">by status</span>
            </div>
          </CardHeader>
          <CardContent>
            <Donut apps={scoped} />
          </CardContent>
        </Card>
      </div>

      {/* Needs-attention + Funnel row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Needs attention</CardTitle>
              <span className="text-sm text-[var(--color-muted-foreground)]">
                {deadlines.length} upcoming
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">No upcoming deadlines.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {deadlines.map(a => {
                  const d = daysUntilDeadline(a.deadline!, now)
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3 py-2"
                    >
                      <Monogram name={a.company} sm />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--color-foreground)]">
                          {a.company}
                        </div>
                        <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                          {a.role}
                        </div>
                      </div>
                      <StatusPill status={a.status} />
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium tabular-nums whitespace-nowrap',
                          d <= 3
                            ? 'text-[var(--color-st-rejected)]'
                            : 'text-[var(--color-muted-foreground)]',
                        )}
                      >
                        <Clock size={13} />
                        {d === 0 ? 'Today' : `${d}d`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversion funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart apps={scoped} />
          </CardContent>
        </Card>
      </div>

      {/* Supporting row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top sources</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={bySource(scoped)}
              getLabel={s => s.source}
              getValue={s => s.total}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={byUser(scoped)}
              getLabel={u => u.name}
              getValue={u => u.added}
              accent="linear-gradient(90deg, var(--color-accent2), var(--color-primary))"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Submission heatmap</CardTitle>
              <span className="text-sm text-[var(--color-muted-foreground)]">16 weeks</span>
            </div>
          </CardHeader>
          <CardContent>
            <Heatmap apps={scoped} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
