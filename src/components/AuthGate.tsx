import type { ReactNode } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { AuthState } from '@/hooks/useAuth'

export function AuthGate({ auth, children }: { auth: AuthState; children: ReactNode }) {
  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    )
  }

  if (auth.status === 'signed-out') {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-accent)]">
              <LogIn className="size-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Jobvault</h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Sign in to view and add job applications.
            </p>
            <Button className="mt-6 w-full" onClick={auth.signIn}>
              Sign in with Google
            </Button>
            {auth.error ? (
              <p className="mt-3 text-xs text-[var(--color-destructive)]">{auth.error}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
