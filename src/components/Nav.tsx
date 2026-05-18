import { LogOut, Moon, Sun } from 'lucide-react'
import type { StoredUser } from '@/auth/adapter'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type View = 'dashboard' | 'applications' | 'kanban' | 'pending' | 'add' | 'settings'

const TABS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'applications', label: 'Applications' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'pending', label: 'Pending' },
  { id: 'add', label: 'Add Links' },
  { id: 'settings', label: 'Settings' },
]

export function Nav({
  view,
  onView,
  user,
  onSignOut,
  dark,
  onToggleDark,
  pendingCount,
}: {
  view: View
  onView: (v: View) => void
  user: StoredUser | null
  onSignOut: () => void
  dark: boolean
  onToggleDark: () => void
  pendingCount: number
}) {
  const tabs = (
    <nav className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onView(t.id)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            view === t.id
              ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/25'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/40 hover:text-[var(--color-foreground)]',
          )}
        >
          {t.label}
          {t.id === 'pending' && pendingCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-semibold text-[var(--color-primary-foreground)]">
              {pendingCount}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)]/60 bg-[var(--color-background)]/70 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-[var(--color-chart-1)] to-[var(--color-chart-2)] text-xs font-bold text-white shadow-[0_4px_12px_-4px_oklch(0.55_0.22_275/0.6)]">
              J
            </span>
            <span className="bg-gradient-to-r from-[var(--color-foreground)] to-[var(--color-foreground)]/70 bg-clip-text text-base font-semibold tracking-tight text-transparent">
              Jobvault
            </span>
          </div>
          <div className="hidden md:block">{tabs}</div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onToggleDark} title="Toggle theme">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-[var(--color-muted-foreground)] sm:inline">
                  {user.displayName ?? user.email}
                </span>
                <Button variant="ghost" size="icon" onClick={onSignOut} title="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="-mx-4 mt-2 px-4 md:hidden">{tabs}</div>
      </div>
    </header>
  )
}
