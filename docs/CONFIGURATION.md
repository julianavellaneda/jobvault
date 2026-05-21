# Configuration

All configuration is via environment variables. For local dev, put them in `.env.local` (auto-loaded). For Docker / production, pass them through the orchestrator.

## Storage

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./data/app.db` | Path to a local SQLite file. The `file:` prefix is optional. Use `:memory:` for an ephemeral in-process DB (testing only). |

The DB is created and migrated on first boot. To wipe: stop the server, delete the file, restart.

## Auth

Jobvault uses local username/password auth backed by SQLite. There is no OAuth and no allowlist.

| Variable | Default | Notes |
|---|---|---|
| `SESSION_SECRET` | _empty_ | ≥ 32 chars. Used to seal session cookies. **Required** — the server refuses to start without it. Generate: `openssl rand -base64 48`. |
| `ADMIN_USERNAME` | _unset_ | Optional. With `ADMIN_PASSWORD`, creates the first admin at boot when the DB is empty. 3-32 chars, letters/numbers/`. _ -`. Useful for headless / Docker deploys. |
| `ADMIN_PASSWORD` | _unset_ | Optional. Subject to `MIN_PASSWORD_LENGTH` — no minimum by default. See above. |
| `MIN_PASSWORD_LENGTH` | _unset_ | Optional. Minimum password length enforced by the setup form and `ADMIN_PASSWORD`. Unset = no minimum (a non-empty password is the only rule). |

On first run (DB empty, no `ADMIN_*` envs), `GET /api/auth/me` returns `{ status: 'needs-setup' }` and the UI shows a one-time setup form that creates the admin user. Subsequent requests use sealed session cookies.

If you set `ADMIN_USERNAME` + `ADMIN_PASSWORD`, the server creates that user at startup when the DB is empty and skips the in-app setup form. The env vars are ignored once any user exists, so they're safe to leave in your compose file.

### Lost admin password

There's no password-reset flow. Recover by clearing the `users` table and re-running setup:

```bash
sqlite3 data/app.db 'DELETE FROM users;'
```

Then restart the server. Applications and pending URLs are untouched.

## AI extraction

Pluggable: OpenAI, Anthropic, Google, MiniMax, OpenRouter, or any OpenAI-compatible
endpoint. **Env wins over the in-app Settings page**;
leave all of this unset to configure provider/model/key from the UI instead. The
extract endpoint degrades gracefully when nothing is configured — the UI just
skips the prefill. See [AI_PROVIDERS.md](AI_PROVIDERS.md) for the full matrix.

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | _unset_ | `openai` \| `anthropic` \| `google` \| `minimax` \| `openrouter` \| `openai-compatible`. Unset = configure from the Settings page. |
| `AI_MODEL` | provider default | Model id (e.g. `gpt-4o-mini`). Blank uses the provider's default. |
| `AI_BASE_URL` | provider default | Required **only** for `openai-compatible` (Ollama / LM Studio / vLLM). Ignored by hosted providers. |
| `OPENAI_API_KEY` | _empty_ | Key for `AI_PROVIDER=openai`. |
| `ANTHROPIC_API_KEY` | _empty_ | Key for `AI_PROVIDER=anthropic`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | _empty_ | Key for `AI_PROVIDER=google`. |
| `OPENROUTER_API_KEY` | _empty_ | Key for `AI_PROVIDER=openrouter`. |
| `AI_API_KEY` | _empty_ | Key for `AI_PROVIDER=openai-compatible` (often unused for local models). |
| `MINIMAX_API_KEY` | _empty_ | Back-compat: setting just this (no `AI_PROVIDER`) still selects MiniMax. |
| `MINIMAX_MODEL` | `MiniMax-M2.5` | MiniMax model id. |
| `MINIMAX_BASE_URL` | provider default | Override only if you proxy MiniMax. |

## Server

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP listen port. |
| `NODE_ENV` | _unset_ | Set to `production` for a real deployment — enables the `secure` cookie flag. |
| `DEBUG_EXTRACT` | _unset_ | Set to `true` to enable verbose `/api/extract` logging (fetched URL, LLM raw output, parse-failure details). Off by default — leaving it off avoids logging user-supplied URLs and signed-in usernames in production. |
