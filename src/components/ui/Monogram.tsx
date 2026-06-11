import { monogramColor } from '@/lib/monogram'
import { cn } from '@/lib/utils'

export interface MonogramProps {
  name: string
  sm?: boolean
  className?: string
}

export function Monogram({ name, sm, className }: MonogramProps) {
  return (
    <div
      className={cn(
        'shrink-0 grid place-items-center rounded-[10px] font-semibold text-white',
        sm ? 'w-[30px] h-[30px] text-[12.5px] rounded-[8px]' : 'w-[38px] h-[38px] text-[15px]',
        className,
      )}
      style={{
        background: monogramColor(name),
        boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.12), inset 0 1px 0 oklch(1 0 0 / 0.18)',
      }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}
