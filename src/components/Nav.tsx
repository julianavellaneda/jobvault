import { LogOut, Moon, Sun } from 'lucide-react'
import type { User } from 'firebase/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type View = 'dashboard' | 'applications' | 'kanban' | 'pending' | 'add'

const TABS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'applications', label: 'Applications' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'pending', label: 'Pending' },
  { id: 'add', label: 'Add Links' },
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
  user: User | null
  onSignOut: () => void
  dark: boolean
  onToggleDark: () => void
  pendingCount: number
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-[var(--color-background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="text-base font-semibold tracking-tight">Jules App Tracker</div>
        <nav className="flex items-center gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => onView(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === t.id
                  ? 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
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
    </header>
  )
}
