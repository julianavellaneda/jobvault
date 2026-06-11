import type { Status } from '@/types'
import { STATUS_LABELS } from '@/types'
import { STATUS_BADGE, STATUS_DOT } from '@/lib/statusColors'
import { cn } from '@/lib/utils'

export interface StatusPillProps {
  status: Status
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[23px] px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap',
        STATUS_BADGE[status],
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  )
}
