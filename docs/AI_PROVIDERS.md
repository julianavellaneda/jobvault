# AI providers

The app has a single AI-touched endpoint: `POST /api/extract`. Given a job-posting URL, it fetches the page (with SSRF protection), strips the HTML to text, and asks a language model to return structured fields (`company`, `role`, `salary`, `location`, `workArrangement`, `source`). The UI uses the result to prefill new application rows.

The model is **bring-your-own-key**: you supply credentials, no key ships with the project.

## Two ways to configure

Configuration is resolved with an **env-wins, DB-fallback** policy — the same pattern as the email allowlist (`server/lib/allowlist.ts`):

1. **Environment variables** (override). If `AI_PROVIDER` is set (or, for back-compat, just `MINIMAX_API_KEY` with no `AI_PROVIDER`), the env values are used and the in-app Settings page becomes read-only. Best for reproducible / infra-as-code deployments (docker-compose).
2. **In-app Settings page** (fallback). If no AI env vars are set, configure the provider, model, key, and (if needed) base URL under the **Settings** tab, click **Test connection**, and **Save**. No restart needed. Best for casual self-hosters.

### Supported providers

| Provider | `AI_PROVIDER` | Key env var | Notes |
|---|---|---|---|
| OpenAI | `openai` | `OPENAI_API_KEY` | default model `gpt-4o-mini` |
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` | default `claude-haiku-4-5-20251001` |
| Google Gemini | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | default `gemini-2.5-flash` |
| MiniMax | `minimax` | `MINIMAX_API_KEY` | default `MiniMax-M2.5` (originally-wired provider) |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | 300+ models, e.g. `openai/gpt-4o-mini` |
| OpenAI-compatible | `openai-compatible` | `AI_API_KEY` (optional) | **local models** — Ollama / LM Studio / vLLM, set `AI_BASE_URL` |

Common cross-provider env vars: `AI_MODEL` (blank = provider default) and `AI_BASE_URL` (required only for `openai-compatible`).

> **Base URL scope:** `AI_BASE_URL` / the Settings "Base URL" field only applies to `openai-compatible` (and, via env only, MiniMax's regional endpoint). The hosted providers (OpenAI/Anthropic/Google/OpenRouter) ignore a custom base URL entirely — this prevents a stale local endpoint from leaking into a hosted provider after switching providers in the UI.

> **Model required without a default:** `openai-compatible` has no default model, so a model id is mandatory — the connection won't be reported "ready" (and `/api/extract` won't run) until one is set.

### Running a local model (no cloud, no key)

Point the `openai-compatible` provider at a local OpenAI-compatible server — great for a homelab/RPi where you don't want to send postings to a cloud API:

```
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://localhost:11434/v1   # Ollama
AI_MODEL=llama3.1
# no key needed
```

…or do the same from the Settings page (leave the API key blank).

## Where keys are stored — and the warning

Keys set via the Settings page are stored **in plaintext** in the single-row `ai_settings` table inside your SQLite database (`data/app.db` by default). This is consistent with the app's trust model (single shared pool, trust-based edits, self-hosted behind your own network) and matches how the allowlist table works.

> ⚠️ **Keep `data/` out of git and out of any shared backups.** A committed or leaked `app.db` exposes the key. The repo's `.gitignore` already excludes `data/`. If you prefer keys never touch the database, use the environment-variable path instead.

The key is **never returned to the browser** — `GET /api/settings/ai` only exposes a masked preview (`••••last4`).

When you switch providers in the Settings page without entering a new key, the previous provider's key is **dropped** rather than silently reused under the new provider — re-enter (or leave blank for keyless local endpoints) before saving.

## Graceful degradation

When AI is unconfigured, the key is missing, or the model errors, `/api/extract` returns a 200 with an `{error}` body (e.g. `ai_not_configured`). The frontend treats this as "no prefill available" and lets you fill the fields manually — no exception, no broken state.

## Architecture

`server/lib/aiProviders.ts` is the single integration point: a registry mapping each `AI_PROVIDER` id to its Vercel AI SDK factory (lazily imported). `server/lib/aiConfig.ts` resolves env-vs-DB. Both `server/routes/extract.ts` and the `POST /api/settings/ai/test` endpoint go through the registry, so adding a provider is one entry in `AI_PROVIDERS`.

## Cost / safety notes

- `/api/extract` and the test endpoint are rate-limited per signed-in user.
- The SSRF guard in `server/lib/safeUrl.ts` rejects loopback, RFC1918, link-local, and IPv6 private addresses before fetching, and pins DNS during the fetch to prevent rebinding.
- The fetched HTML is capped at 1 MB before reaching the model.
