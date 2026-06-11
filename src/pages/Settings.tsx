import { Moon, Sun } from 'lucide-react'
import { useAiSettings } from '@/hooks/useAiSettings'
import { SettingsForm } from '@/components/SettingsForm'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

export function Settings({
  dark,
  onToggleDark,
}: {
  dark: boolean
  onToggleDark: () => void
}) {
  const { data, loading, error, save, test } = useAiSettings()

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      {/* Page head */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Configure the AI provider used to extract job-posting fields. Keys are stored
          locally in your app database — keep <code>data/</code> out of git and backups.
        </p>
      </div>

      {/* Env-managed banner */}
      {data?.source === 'env' ? (
        <div className="rounded-xl border border-[var(--color-primary-line)] bg-[var(--color-primary-soft)] px-4 py-3 text-sm">
          <span className="font-medium">Managed by environment variable.</span> AI config
          is set via <code>AI_PROVIDER</code> / <code>*_API_KEY</code> env vars, which take
          precedence over anything saved here. Edit your env / compose file to change it.
          You can still run a connection test below.
        </div>
      ) : null}

      {/* AI provider card */}
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

      {/* Appearance card */}
      <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--color-border-soft)] px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight">Appearance</h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                Match your system or pick a side.
              </p>
            </div>
            <SegmentedControl
              value={dark ? 'dark' : 'light'}
              onChange={v => {
                if ((v === 'dark') !== dark) onToggleDark()
              }}
              options={[
                {
                  value: 'light',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Sun className="size-3.5" />
                      Light
                    </span>
                  ),
                },
                {
                  value: 'dark',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Moon className="size-3.5" />
                      Dark
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
