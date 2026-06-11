import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)]/40 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus-visible:outline-none focus-visible:border-[var(--color-primary-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-primary-soft)] focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
