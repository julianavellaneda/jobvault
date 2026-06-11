import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ChipProps {
  active?: boolean
  onClick?: () => void
  dot?: string
  children: ReactNode
  className?: string
}

export function Chip({ active, onClick, dot, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-[11px] rounded-full text-[12.5px] font-medium border transition-colors',
        active
          ? 'bg-primary-soft border-primary-line text-foreground'
          : 'bg-surface border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
        className,
      )}
    >
      {dot && <span className={cn('w-[7px] h-[7px] rounded-full', dot)} />}
      {children}
    </button>
  )
}
