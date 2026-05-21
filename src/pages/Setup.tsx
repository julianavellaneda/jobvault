import { useState, type FormEvent } from 'react'
import { Loader2, Sparkles, UserPlus } from 'lucide-react'
import { apiFetch, ApiError } from '@/storage/rest/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SettingsForm } from '@/components/SettingsForm'
import { useAiSettings } from '@/hooks/useAiSettings'

type Step = 'account' | 'ai'

export function Setup({
  onComplete,
  minPasswordLength = 1,
}: {
  onComplete: () => void
  minPasswordLength?: number
}) {
  const [step, setStep] = useState<Step>('account')
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <Steps current={step} />
        {step === 'account' ? (
          <AccountStep onDone={() => setStep('ai')} minPasswordLength={minPasswordLength} />
        ) : (
          <AiStep onDone={onComplete} />
        )}
      </div>
    </div>
  )
}

function Steps({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-muted-foreground)]">
      <span className={current === 'account' ? 'font-medium text-[var(--color-foreground)]' : ''}>
        1. Account
      </span>
      <span>›</span>
      <span className={current === 'ai' ? 'font-medium text-[var(--color-foreground)]' : ''}>
        2. AI provider (optional)
      </span>
    </div>
  )
}

function AccountStep({
  onDone,
  minPasswordLength,
}: {
  onDone: () => void
  minPasswordLength: number
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    const u = username.trim()
    if (u.length < 3 || u.length > 32) return 'Username must be 3-32 characters.'
    if (!/^[a-zA-Z0-9._-]+$/.test(u))
      return 'Username may only contain letters, numbers, and . _ -'
    if (minPasswordLength > 1 && password.length < minPasswordLength)
      return `Password must be at least ${minPasswordLength} characters.`
    if (password.length < 1) return 'Password is required.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/auth/setup', {
        method: 'POST',
        body: { username: username.trim(), password },
      })
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError('Setup is already complete on this server. Reload to sign in.')
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <UserPlus className="size-5" />
        </div>
        <CardTitle className="text-center">Welcome to Jobvault</CardTitle>
        <p className="text-center text-sm text-[var(--color-muted-foreground)]">
          Create your account to get started. You'll be the only user on this instance.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            disabled={busy}
          />
          <Input
            type="password"
            placeholder={
              minPasswordLength > 1 ? `Password (min ${minPasswordLength} characters)` : 'Password'
            }
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={minPasswordLength}
            disabled={busy}
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create account
          </Button>
          {error ? (
            <p className="text-center text-sm text-[var(--color-destructive)]">{error}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

function AiStep({ onDone }: { onDone: () => void }) {
  const { data, loading, error, save, test } = useAiSettings()
  return (
    <Card>
      <CardHeader>
        <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <Sparkles className="size-5" />
        </div>
        <CardTitle className="text-center">Set up an AI provider</CardTitle>
        <p className="text-center text-sm text-[var(--color-muted-foreground)]">
          Optional — used to auto-extract company, role, and salary from job-posting URLs.
          You can set this up later in Settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-[var(--color-destructive)]">
            Failed to load settings: {error ?? 'unknown error'}
          </p>
        ) : (
          <SettingsForm
            key={`${data.source}:${data.effective.provider}`}
            data={data}
            save={save}
            test={test}
          />
        )}
        <Button variant="outline" className="w-full" onClick={onDone}>
          {data?.ready ? 'Continue' : "Skip — I'll set this up later"}
        </Button>
      </CardContent>
    </Card>
  )
}
