import { Columns3, LayoutDashboard, List, LogOut, Moon, Plus, Settings, Sun, Inbox } from 'lucide-react'
import type { ComponentType } from 'react'
import type { AuthUser } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export type View = 'dashboard' | 'applications' | 'kanban' | 'pending' | 'add' | 'settings'

const ICON_BTN =
  'grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-foreground'

const TABS: { id: View; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'applications', label: 'Applications', Icon: List },
  { id: 'kanban', label: 'Kanban', Icon: Columns3 },
  { id: 'pending', label: 'Pending', Icon: Inbox },
  { id: 'add', label: 'Add Links', Icon: Plus },
  { id: 'settings', label: 'Settings', Icon: Settings },
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
  user: AuthUser | null
  onSignOut: () => void
  dark: boolean
  onToggleDark: () => void
  pendingCount: number
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border-soft)] bg-[var(--color-background)]/72 backdrop-blur-[16px] backdrop-saturate-150">
      <div className="mx-auto flex h-[62px] max-w-[1500px] items-center gap-[22px] px-[26px]">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-[11px]">
          <img src="/logo.svg" alt="Jobvault" className="h-8 w-8" />
          <span className="text-base font-semibold tracking-[-0.02em]">
            Jobvault
          </span>
        </div>

        {/* Pill nav */}
        <nav className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(t => {
            const active = view === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onView(t.id)}
                className={cn(
                  'inline-flex items-center gap-[7px] rounded-[9px] px-[13px] py-2 text-[13.5px] font-medium transition-colors',
                  active
                    ? 'bg-primary-soft text-foreground ring-1 ring-inset ring-primary-line'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                )}
              >
                <t.Icon
                  className={cn(
                    'size-4',
                    active ? 'text-primary-strong opacity-100' : 'opacity-85',
                  )}
                />
                <span className="max-[720px]:hidden">{t.label}</span>
                {t.id === 'pending' && pendingCount > 0 ? (
                  <span className="grid min-w-[18px] place-items-center rounded-full bg-[var(--color-primary)] px-[5px] py-0 text-[10.5px] font-bold tabular-nums text-[var(--color-primary-foreground)] h-[18px]">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-3">
          {/* Theme toggle */}
          <button type="button" onClick={onToggleDark} title="Toggle theme" className={ICON_BTN}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* User chip */}
          {user ? (
            <div className="flex items-center gap-[9px] rounded-full border border-border bg-surface py-1 pl-[11px] pr-1">
              <span className="max-[480px]:hidden text-[12.5px] text-muted-foreground">
                {user.username}
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(150deg,var(--color-primary-strong),var(--color-accent2))] text-xs font-semibold text-white">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
          ) : null}

          {/* Sign out */}
          <button type="button" onClick={onSignOut} title="Sign out" className={ICON_BTN}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
