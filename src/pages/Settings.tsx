import { useAiSettings } from '@/hooks/useAiSettings'
import { SettingsForm } from '@/components/SettingsForm'

export function Settings() {
  const { data, loading, error, save, test } = useAiSettings()

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Configure the AI provider used to extract job-posting fields. Keys are stored
          locally in your app database — keep <code>data/</code> out of git and backups.
        </p>
      </div>

      {data?.source === 'env' ? (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-accent)]/30 px-4 py-3 text-sm">
          <span className="font-medium">Managed by environment variable.</span> AI config
          is set via <code>AI_PROVIDER</code> / <code>*_API_KEY</code> env vars, which take
          precedence over anything saved here. Edit your env / compose file to change it.
          You can still run a connection test below.
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">Loading settings…</div>
      ) : error || !data ? (
        <div className="text-sm text-[var(--color-destructive)]">
          Failed to load settings: {error ?? 'unknown error'}
        </div>
      ) : (
        <SettingsForm
          key={`${data.source}:${data.effective.provider}`}
          data={data}
          save={save}
          test={test}
        />
      )}
    </div>
  )
}
