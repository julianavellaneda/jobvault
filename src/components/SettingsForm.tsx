import { useState, type ReactNode } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { AiProviderId } from '@/types'
import type { AiSettingsPatch, AiSettingsView } from '@/lib/aiSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--color-faint)]">{hint}</p> : null}
    </div>
  )
}

export function SettingsForm({
  data,
  save,
  test,
}: {
  data: AiSettingsView
  save: (patch: AiSettingsPatch) => Promise<boolean>
  test: (patch: AiSettingsPatch) => Promise<boolean>
}) {
  const [provider, setProvider] = useState<AiProviderId>(data.effective.provider)
  const [model, setModel] = useState(data.effective.model)
  const [baseUrl, setBaseUrl] = useState(data.effective.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)

  const meta = data.providers.find(p => p.id === provider) ?? data.providers[0]
  const envManaged = data.source === 'env'
  const providerChanged = provider !== data.effective.provider

  function buildPatch(): AiSettingsPatch {
    const patch: AiSettingsPatch = {
      provider,
      model,
      baseUrl: meta.needsBaseUrl ? baseUrl : '',
    }
    if (apiKey.trim()) {
      patch.apiKey = apiKey
    } else if (providerChanged) {
      patch.apiKey = ''
    }
    return patch
  }

  async function handleTest() {
    setBusy('test')
    try {
      await test(buildPatch())
    } finally {
      setBusy(null)
    }
  }

  async function handleSave() {
    setBusy('save')
    try {
      const ok = await save(buildPatch())
      if (ok) setApiKey('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      {/* Card head */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-5 py-3.5">
        <h3 className="text-sm font-semibold tracking-tight">AI provider</h3>
        <span className="text-xs text-[var(--color-faint)]">Used for extraction</span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Provider grid */}
        <Field label="Provider">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.providers.map(p => {
              const active = p.id === provider
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  disabled={envManaged}
                  onClick={() => {
                    setProvider(p.id as AiProviderId)
                    setModel('')
                    setBaseUrl('')
                  }}
                  className={cn(
                    'relative flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    active
                      ? 'border-[var(--color-primary-line)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-3)]',
                  )}
                >
                  <span>{p.label}</span>
                  {active ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Model + API key (two-column on sm+) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Model"
            hint={
              meta.defaultModel
                ? `Leave blank to use ${meta.defaultModel}`
                : 'Required for this provider'
            }
          >
            <Input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={meta.defaultModel || 'e.g. llama3.1'}
              disabled={envManaged}
            />
          </Field>

          <Field
            label="API key"
            hint={
              meta.keyOptional
                ? 'Optional — local endpoints (Ollama/LM Studio) usually need no key.'
                : data.effective.hasKey
                  ? `A key is set (${data.effective.keyPreview}). Leave blank to keep it.`
                  : 'No key set yet.'
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={data.effective.hasKey ? '••••••••  (unchanged)' : 'Paste API key'}
              disabled={envManaged}
              autoComplete="off"
            />
          </Field>
        </div>

        {/* Base URL (conditional, full width) */}
        {meta.needsBaseUrl ? (
          <Field
            label="Base URL"
            hint="OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 (Ollama)"
          >
            <Input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              disabled={envManaged}
            />
          </Field>
        ) : null}
      </div>

      {/* Card footer */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border-soft)] px-5 py-3.5">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={busy !== null}>
          {busy === 'test' ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Test connection
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy !== null || envManaged}>
          {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
        <span className="ml-auto text-xs text-[var(--color-faint)]">
          source: {data.source}
          {data.ready ? '' : ' · not configured'}
        </span>
      </div>
    </div>
  )
}
