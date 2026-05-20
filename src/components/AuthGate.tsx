import type { ReactNode } from 'react'
import { Login } from '@/pages/Login'
import { Setup } from '@/pages/Setup'
import type { AuthState } from '@/hooks/useAuth'

export function AuthGate({ auth, children }: { auth: AuthState; children: ReactNode }) {
  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    )
  }

  if (auth.status === 'needs-setup') {
    return <Setup onComplete={auth.refresh} />
  }

  if (auth.status === 'signed-out') {
    return <Login onSignedIn={auth.refresh} />
  }

  return <>{children}</>
}
