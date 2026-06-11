import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)]/40 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-[var(--color-muted-foreground)]/70 focus-visible:outline-none focus-visible:border-[var(--color-primary-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-primary-soft)] focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
