import { useState, type FormEvent } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import { apiFetch, ApiError } from '@/storage/rest/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      onSignedIn()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid username or password.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Try again in a minute.')
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <LogIn className="size-6" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Jobvault</h1>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Sign in to continue.</p>
          </div>
        </div>

        {/* Glass card */}
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow)]">
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="text"
              autoComplete="username"
              required
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={busy}
            />
            <Input
              type="password"
              autoComplete="current-password"
              required
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Sign in
            </Button>
            {error ? (
              <p className="text-center text-sm text-[var(--color-destructive)]">{error}</p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  )
}
