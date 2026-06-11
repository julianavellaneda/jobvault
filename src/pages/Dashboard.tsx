import { CheckCircle2, Flame, Inbox, Send } from 'lucide-react'
import type { Application } from '@/types'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  pendingCount,
  totalApplied,
} from '@/lib/stats'

export function Dashboard({ apps }: { apps: Application[] }) {
  const streak = computeStreak(apps)
  const today = appliedTodayCount(apps)
  const applied = totalApplied(apps)
  const backlog = pendingCount(apps)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Track your application activity and conversion.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Streak"
          value={streak}
          subtitle={streak === 1 ? 'day in a row' : 'days in a row'}
          icon={<Flame />}
          accent
        />
        <StatCard label="Applied today" value={today} icon={<Send />} />
        <StatCard label="Total applied" value={applied} icon={<CheckCircle2 />} />
        <StatCard label="Pending backlog" value={backlog} icon={<Inbox />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityChart apps={apps} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut apps={apps} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart apps={apps} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Submission heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap apps={apps} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top sources</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={bySource(apps)}
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
              data={byUser(apps)}
              getLabel={u => u.name}
              getValue={u => u.added}
              accent="linear-gradient(90deg, var(--color-accent2), var(--color-primary))"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
