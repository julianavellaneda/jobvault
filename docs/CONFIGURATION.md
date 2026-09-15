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
| `SETUP_TOKEN` | _random_ | Optional. The one-time token the setup form asks for when the server isn't bound to loopback. Unset = a random token is generated at boot and printed to the logs. |
| `COOKIE_SECURE` | _auto_ | `true` / `false`. Forces the session cookie's `Secure` flag. Default: on when `NODE_ENV=production`. Set `false` only if you serve over plain HTTP on a LAN address — browsers drop `Secure` cookies there and login silently fails. |

On first run (DB empty, no `ADMIN_*` envs), `GET /api/auth/me` returns `{ status: 'needs-setup' }` and the UI shows a one-time setup form that creates the admin user. Subsequent requests use sealed session cookies backed by a server-side session row, so logout revokes the session.

**Setup token.** If the server listens on anything other than loopback (`HOST=0.0.0.0`, as in the Docker image), the setup form also asks for a one-time token. It's printed in the server logs at startup (`docker compose logs app`). This stops whoever finds a fresh, network-reachable instance first from claiming the admin account. Loopback installs (the default `bun run start`, the desktop app) don't need it.

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
| `HOST` | `127.0.0.1` | Interface to bind. Loopback by default, so a source install isn't reachable from your network. Set `0.0.0.0` to expose it (the Docker image does this). Binding beyond loopback turns on the setup token. |
| `TRUST_PROXY` | _unset_ | Set to `true` **only** when a reverse proxy sits in front of the app. The login rate limiter then keys on the rightmost `X-Forwarded-For` hop instead of the socket address. Leave unset otherwise — without a proxy that header is client-controlled. |
| `NODE_ENV` | _unset_ | Set to `production` for a real deployment — enables the `secure` cookie flag (see `COOKIE_SECURE`). |
| `DEBUG_EXTRACT` | _unset_ | Set to `true` to enable verbose `/api/extract` logging (fetched URL, LLM raw output, parse-failure details). Off by default — leaving it off avoids logging user-supplied URLs and signed-in usernames in production. |
