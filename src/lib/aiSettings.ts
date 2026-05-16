import type { AiProviderId } from '@/types'

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  defaultModel: string
  needsBaseUrl: boolean
  keyOptional: boolean
}

export interface AiSettingsView {
  source: 'env' | 'db' | 'none'
  ready: boolean
  effective: {
    provider: AiProviderId
    model: string
    baseUrl: string
    hasKey: boolean
    keyPreview: string | null
  }
  providers: AiProviderMeta[]
}

export interface AiSettingsPatch {
  provider?: AiProviderId
  apiKey?: string
  model?: string
  baseUrl?: string
}

export type TestResult = { ok: true; sample?: string } | { ok: false; error: string }

export async function getAiSettings(): Promise<AiSettingsView> {
  const res = await fetch('/api/settings/ai', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as AiSettingsView
}

export async function saveAiSettings(patch: AiSettingsPatch): Promise<void> {
  const res = await fetch('/api/settings/ai', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export async function testAiConnection(patch: AiSettingsPatch): Promise<TestResult> {
  try {
    const res = await fetch('/api/settings/ai/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => null)) as TestResult | null
    if (!data) return { ok: false, error: `HTTP ${res.status}` }
    return data
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
