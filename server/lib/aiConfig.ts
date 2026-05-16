import type { DataAdapter } from '../../src/storage/adapter.ts'
import type { AiProviderId } from '../../src/types.ts'
import { AI_PROVIDERS, isAiProviderId, type ResolvedAiConfig } from './aiProviders.ts'

export type AiConfigSource = 'env' | 'db' | 'none'

export type AiConfigResolution = {
  source: AiConfigSource
  /** True when the resolved config has everything needed to call the model. */
  ready: boolean
  config: ResolvedAiConfig
}

/** Mask a secret for display: never return the raw key to the browser. */
export function maskKey(key: string): string | null {
  const k = key.trim()
  if (!k) return null
  return k.length <= 4 ? '••••' : `••••${k.slice(-4)}`
}

function envProvider(): AiProviderId | null {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (raw && isAiProviderId(raw)) return raw
  // Back-compat: the original release only wired MiniMax via MINIMAX_API_KEY
  // with no AI_PROVIDER switch. Honour that without any config change.
  if (!raw && process.env.MINIMAX_API_KEY) return 'minimax'
  return null
}

function readyFor(provider: AiProviderId, cfg: ResolvedAiConfig): boolean {
  const meta = AI_PROVIDERS[provider]
  if (meta.needsBaseUrl && !cfg.baseUrl.trim()) return false
  if (!meta.keyOptional && !cfg.apiKey.trim()) return false
  // Providers with no default model (e.g. openai-compatible) need an explicit
  // model id, otherwise the SDK would be handed an empty model name.
  if (!meta.defaultModel && !cfg.model.trim()) return false
  return true
}

export async function resolveAiConfig(adapter: DataAdapter): Promise<AiConfigResolution> {
  const envP = envProvider()
  if (envP) {
    const meta = AI_PROVIDERS[envP]
    const config: ResolvedAiConfig = {
      provider: envP,
      model:
        process.env.AI_MODEL?.trim() ||
        (envP === 'minimax' ? process.env.MINIMAX_MODEL?.trim() ?? '' : ''),
      baseUrl:
        process.env.AI_BASE_URL?.trim() ||
        (envP === 'minimax' ? process.env.MINIMAX_BASE_URL?.trim() ?? '' : ''),
      apiKey: process.env[meta.keyEnvVar]?.trim() ?? '',
    }
    return { source: 'env', ready: readyFor(envP, config), config }
  }

  const row = await adapter.getAiSettings()
  if (row) {
    const config: ResolvedAiConfig = {
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
    }
    return { source: 'db', ready: readyFor(row.provider, config), config }
  }

  return {
    source: 'none',
    ready: false,
    config: { provider: 'minimax', model: '', baseUrl: '', apiKey: '' },
  }
}
