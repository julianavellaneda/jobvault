import { useId } from 'react'
import type { Application } from '@/types'
import type { Status } from '@/types'
import { STATUSES, STATUS_LABELS } from '@/types'
import { dailyCounts, funnelCounts, statusCounts, submissionHeatmap } from '@/lib/stats'

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<Status, string> = {
  pending: 'var(--color-st-pending)',
  applied: 'var(--color-st-applied)',
  interview: 'var(--color-st-interview)',
  offer: 'var(--color-st-offer)',
  rejected: 'var(--color-st-rejected)',
}

// Maps funnel stage label → status key (for color lookup)
const STAGE_STATUS: Record<string, Status> = {
  Applied: 'applied',
  Interview: 'interview',
  Offer: 'offer',
}

// ── ActivityChart ─────────────────────────────────────────────────────────────

export function ActivityChart({ apps }: { apps: Application[] }) {
  const gid = useId()
  const data = dailyCounts(apps, 30)
  const W = 560
  const H = 150
  const pad = 6
  const max = Math.max(1, ...data.map(d => d.count))
  const bw = (W - pad * 2) / data.length

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 150 }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary-strong)" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g, i) => (
          <line
            key={i}
            x1={pad}
            x2={W - pad}
            y1={H - g * (H - 20)}
            y2={H - g * (H - 20)}
            stroke="var(--color-border-soft)"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 24)
          const x = pad + i * bw + bw * 0.18
          const w = bw * 0.64
          return (
            <rect
              key={i}
              x={x}
              y={H - Math.max(h, d.count ? 2 : 0)}
              width={w}
              height={Math.max(h, d.count ? 2 : 0)}
              rx={2.5}
              fill={d.count ? `url(#${gid})` : 'var(--color-surface-3)'}
              opacity={d.count ? 1 : 0.6}
            />
          )
        })}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-[var(--color-faint)]">
        <span>30 days ago</span>
        <span>today</span>
      </div>
    </div>
  )
}

// ── FunnelChart ───────────────────────────────────────────────────────────────

export function FunnelChart({ apps }: { apps: Application[] }) {
  const data = funnelCounts(apps)
  const max = Math.max(1, ...data.map(d => d.count))
  const first = data[0]

  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => {
        const pct = (d.count / max) * 100
        const conv =
          i === 0 || !first || first.count === 0
            ? 100
            : Math.round((d.count / first.count) * 100)
        const status = STAGE_STATUS[d.stage] ?? 'applied'
        const color = STATUS_COLORS[status]

        return (
          <div key={d.stage} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                {d.stage}
              </span>
              <span className="tabular-nums">
                {d.count}{' '}
                <span className="text-[var(--color-faint)]">· {conv}%</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-surface-3)]">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: pct + '%', background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────────

export function Donut({ apps }: { apps: Application[] }) {
  const counts = statusCounts(apps)
  const total = STATUSES.reduce((s, st) => s + counts[st], 0)
  const safeTotal = total || 1
  const R = 52
  const C = 2 * Math.PI * R

  // Pre-compute cumulative fractions without mutating within .map
  const fracs = STATUSES.map(status => counts[status] / safeTotal)
  const arcs = STATUSES.map((status, i) => {
    const frac = fracs[i]
    const dash = frac * C
    const runningAcc = fracs.slice(0, i).reduce((s, f) => s + f, 0)
    const offset = -runningAcc * C
    return { status, frac, dash, offset }
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, flexShrink: 0 }}>
        {/* base track */}
        <circle
          cx={70}
          cy={70}
          r={R}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={16}
        />
        {arcs.map(({ status, dash, offset }) => (
          <circle
            key={status}
            cx={70}
            cy={70}
            r={R}
            fill="none"
            stroke={STATUS_COLORS[status]}
            strokeWidth={16}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            transform="rotate(-90 70 70)"
            strokeLinecap="butt"
          />
        ))}
        <text
          x={70}
          y={64}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={22}
          fontWeight={700}
          fill="var(--color-foreground)"
        >
          {total}
        </text>
        <text
          x={70}
          y={82}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fill="var(--color-muted-foreground)"
        >
          total
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 text-sm min-w-0">
        {STATUSES.map(status => (
          <div key={status} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: STATUS_COLORS[status] }}
            />
            <span className="flex-1 text-[var(--color-foreground)]">
              {STATUS_LABELS[status]}
            </span>
            <span className="tabular-nums text-[var(--color-muted-foreground)]">
              {counts[status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BarList ───────────────────────────────────────────────────────────────────

export function BarList<T>({
  data,
  getLabel,
  getValue,
  accent,
}: {
  data: T[]
  getLabel: (d: T) => string
  getValue: (d: T) => number
  accent?: string
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">No data yet.</p>
    )
  }

  const max = Math.max(1, ...data.map(getValue))
  const fill = accent ?? 'linear-gradient(90deg, var(--color-primary), var(--color-accent2))'

  return (
    <div className="flex flex-col gap-2">
      {data.map(d => {
        const label = getLabel(d)
        const value = getValue(d)
        const pct = (value / max) * 100
        return (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span
              className="w-28 shrink-0 truncate text-[var(--color-foreground)]"
              title={label}
            >
              {label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-3)]">
              <div
                className="h-2 rounded-full"
                style={{ width: pct + '%', background: fill }}
              />
            </div>
            <span className="tabular-nums text-[var(--color-muted-foreground)] w-8 text-right">
              {value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
// color-mix percentages for levels 0–3
const LEVEL_MIX = [8, 35, 62, 90]

export function Heatmap({ apps }: { apps: Application[] }) {
  const weeks = 16
  const grid = submissionHeatmap(apps, weeks)
  const max = Math.max(1, ...grid.flat())

  function cellLevel(count: number): number {
    if (count === 0) return 0
    const ratio = count / max
    return ratio <= 1 / 3 ? 1 : ratio <= 2 / 3 ? 2 : 3
  }

  return (
    <div className="flex flex-col gap-1">
      {grid.map((row, d) => (
        <div key={d} className="flex items-center gap-1">
          <span className="w-3 shrink-0 text-[10px] text-[var(--color-faint)] select-none">
            {WEEKDAY_LABELS[d]}
          </span>
          <div className="flex gap-1">
            {row.map((count, w) => {
              const level = cellLevel(count)
              const mix = LEVEL_MIX[level]
              return (
                <span
                  key={w}
                  className="h-2.5 w-2.5 rounded-[3px]"
                  title={`${count}`}
                  style={{
                    background: `color-mix(in oklch, var(--color-primary) ${mix}%, transparent)`,
                  }}
                />
              )
            })}
          </div>
        </div>
      ))}
      {/* legend */}
      <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--color-faint)]">
        <span>Less</span>
        {LEVEL_MIX.map((mix, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{
              background: `color-mix(in oklch, var(--color-primary) ${mix}%, transparent)`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

