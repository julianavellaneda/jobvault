import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  subtitle,
  unit,
  icon,
  accent = false,
}: {
  label: string
  value: string | number
  subtitle?: string
  unit?: string
  icon?: ReactNode
  accent?: boolean
}) {
  const inner = (
    <Card
      className={cn(
        'h-full',
        accent && 'border-transparent bg-[var(--color-card)]',
      )}
    >
      <CardContent className="flex flex-col gap-2 p-4 pt-4 sm:gap-3 sm:p-5 sm:pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] sm:text-xs">
            {label}
          </span>
          {icon ? (
            <span
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/20 sm:size-9 [&_svg]:size-4',
                accent && 'bg-[var(--color-primary)]/15 ring-[var(--color-primary)]/30',
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
        {/* unit is rendered verbatim adjacent to value — include a leading space for
            word-separated units (e.g. " days") or no space for attached symbols (e.g. "%") */}
        <div className="flex items-baseline text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
          {unit ? (
            <span className="text-base font-medium text-[var(--color-muted-foreground)]">{unit}</span>
          ) : null}
        </div>
        {subtitle ? (
          <div className="-mt-1 text-xs text-[var(--color-muted-foreground)]">{subtitle}</div>
        ) : null}
      </CardContent>
    </Card>
  )
  if (!accent) return inner
  return (
    <div className="rounded-xl bg-gradient-to-br from-[var(--color-primary)]/40 via-[var(--color-chart-2)]/20 to-transparent p-px shadow-[0_8px_30px_-10px_oklch(0.55_0.22_275/0.45)]">
      {inner}
    </div>
  )
}
