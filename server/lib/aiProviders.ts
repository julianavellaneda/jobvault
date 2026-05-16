import type { LanguageModel } from 'ai'
import type { AiProviderId } from '../../src/types.ts'

export type ResolvedAiConfig = {
  provider: AiProviderId
  model: string
  baseUrl: string
  apiKey: string
}

export type AiProviderMeta = {
  id: AiProviderId
  label: string
  /** Default model id used when the user/env leaves model blank. */
  defaultModel: string
  /** Env var the hosted-config path reads the key from. */
  keyEnvVar: string
  /** A base URL is required (true) or optional (false). */
  needsBaseUrl: boolean
  /** Key is optional — e.g. a local Ollama / LM Studio endpoint. */
  keyOptional: boolean
  /** Build an AI SDK language model from a resolved config. */
  createModel: (cfg: ResolvedAiConfig) => Promise<LanguageModel>
}

function modelOf(cfg: ResolvedAiConfig, fallback: string): string {
  return cfg.model.trim() || fallback
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyEnvVar: 'OPENAI_API_KEY',
    needsBaseUrl: false,
    keyOptional: false,
    async createModel(cfg) {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const p = createOpenAI({ apiKey: cfg.apiKey })
      return p(modelOf(cfg, this.defaultModel))
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    needsBaseUrl: false,
    keyOptional: false,
    async createModel(cfg) {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const p = createAnthropic({ apiKey: cfg.apiKey })
      return p(modelOf(cfg, this.defaultModel))
    },
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    needsBaseUrl: false,
    keyOptional: false,
    async createModel(cfg) {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      const p = createGoogleGenerativeAI({ apiKey: cfg.apiKey })
      return p(modelOf(cfg, this.defaultModel))
    },
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    defaultModel: 'MiniMax-M2.5',
    keyEnvVar: 'MINIMAX_API_KEY',
    needsBaseUrl: false,
    keyOptional: false,
    async createModel(cfg) {
      const { createMinimax } = await import('vercel-minimax-ai-provider')
      const p = createMinimax({
        apiKey: cfg.apiKey,
        // MiniMax has a distinct international endpoint; honour an explicit
        // override (env MINIMAX_BASE_URL / AI_BASE_URL) but never a stale one.
        ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
      })
      return p(modelOf(cfg, this.defaultModel))
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    keyEnvVar: 'OPENROUTER_API_KEY',
    needsBaseUrl: false,
    keyOptional: false,
    async createModel(cfg) {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
      const p = createOpenRouter({ apiKey: cfg.apiKey })
      return p.chat(modelOf(cfg, this.defaultModel))
    },
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-compatible (Ollama, LM Studio, vLLM, …)',
    defaultModel: '',
    keyEnvVar: 'AI_API_KEY',
    needsBaseUrl: true,
    keyOptional: true,
    async createModel(cfg) {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      const p = createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: cfg.baseUrl,
        ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
      })
      return p(modelOf(cfg, this.defaultModel))
    },
  },
}

export const AI_PROVIDER_LIST: AiProviderMeta[] = Object.values(AI_PROVIDERS)

export function isAiProviderId(v: unknown): v is AiProviderId {
  return typeof v === 'string' && v in AI_PROVIDERS
}
