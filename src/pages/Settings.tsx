import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { AiProviderId } from '@/types'
import { useAiSettings } from '@/hooks/useAiSettings'
import type { AiSettingsPatch, AiSettingsView } from '@/lib/aiSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint ? <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p> : null}
    </div>
  )
}

function SettingsForm({
  data,
  save,
  test,
}: {
  data: AiSettingsView
  save: (patch: AiSettingsPatch) => Promise<boolean>
  test: (patch: AiSettingsPatch) => Promise<boolean>
}) {
  // Seeded from props at mount; the parent remounts via `key` on reload.
  const [provider, setProvider] = useState<AiProviderId>(data.effective.provider)
  const [model, setModel] = useState(data.effective.model)
  const [baseUrl, setBaseUrl] = useState(data.effective.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)

  const meta = data.providers.find(p => p.id === provider) ?? data.providers[0]
  const envManaged = data.source === 'env'
  const providerChanged = provider !== data.effective.provider

  function buildPatch(): AiSettingsPatch {
    // Only persist a base URL for providers that use one — otherwise a stale
    // local/custom endpoint would leak into a hosted provider after a switch.
    const patch: AiSettingsPatch = {
      provider,
      model,
      baseUrl: meta.needsBaseUrl ? baseUrl : '',
    }
    if (apiKey.trim()) {
      patch.apiKey = apiKey
    } else if (providerChanged) {
      // Switching providers without a new key: drop the prior provider's key
      // rather than silently reusing it under a different provider.
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
    <Card>
      <CardHeader>
        <CardTitle>AI provider</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Provider">
          <Select
            value={provider}
            onValueChange={v => {
              setProvider(v as AiProviderId)
              setModel('')
              setBaseUrl('')
            }}
            disabled={envManaged}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.providers.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

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

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" onClick={handleTest} disabled={busy !== null}>
            {busy === 'test' ? <Loader2 className="size-4 animate-spin" /> : null}
            Test connection
          </Button>
          <Button onClick={handleSave} disabled={busy !== null || envManaged}>
            {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
            source: {data.source}
            {data.ready ? '' : ' · not configured'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

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
