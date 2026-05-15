# Configuration

All configuration is via environment variables. For local dev, put them in `.env.local` (auto-loaded). For Docker / production, pass them through the orchestrator.

## Storage

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./data/app.db` | Path to a local SQLite file. The `file:` prefix is optional. Use `:memory:` for an ephemeral in-process DB (testing only). |

The DB is created and migrated on first boot. To wipe: stop the server, delete the file, restart.

## Auth

| Variable | Default | Notes |
|---|---|---|
| `AUTH_MODE` | `none` | `none` → synthetic local user. `oauth` → Google OAuth. |
| `ALLOW_NO_AUTH` | _unset_ | Required to use `AUTH_MODE=none` in production. Otherwise the server returns 503 on every request. |
| `OAUTH_PROVIDER` | `google` | Only Google is supported today. |
| `OAUTH_CLIENT_ID` | _empty_ | Google OAuth client id. Required when `AUTH_MODE=oauth`. |
| `OAUTH_CLIENT_SECRET` | _empty_ | Google OAuth client secret. Required when `AUTH_MODE=oauth`. |
| `SESSION_SECRET` | _empty_ | ≥ 32 chars. Used to seal session cookies. Required when `AUTH_MODE=oauth`. Generate: `openssl rand -base64 32`. |
| `ALLOWLIST` | _unset_ | Comma-separated emails. **Env wins over SQL.** Empty (set, but blank) = anyone signed in. If unset, falls back to the SQL `allowlist` table; empty table = anyone signed in. Case-insensitive. |
| `PUBLIC_BASE_URL` | request host | Public origin. Used to build the OAuth redirect URI and the post-login redirect. Set this in production. |

### Allowlist behavior

| `ALLOWLIST` env | SQL `allowlist` table | Result |
|---|---|---|
| `a@x.com,b@y.com` | (anything) | Only those two emails allowed. |
| _set but empty_ | (anything) | Anyone signed in via OAuth is allowed. |
| _unset_ | has rows | Only emails in the table are allowed. |
| _unset_ | empty | Anyone signed in via OAuth is allowed. |

### Setting up Google OAuth

1. Create OAuth 2.0 credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Authorized redirect URI: `${PUBLIC_BASE_URL}/api/auth/callback`.
3. Copy the client id + secret into `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`.
4. Generate `SESSION_SECRET` (≥ 32 chars).
5. Optionally seed `ALLOWLIST` with the emails that should be allowed.
6. Restart the server. Visit `/api/auth/login`.

## AI extraction

See [AI_PROVIDERS.md](AI_PROVIDERS.md) for details. The extract endpoint degrades gracefully when no key is set — the UI just skips the prefill.

| Variable | Default | Notes |
|---|---|---|
| `MINIMAX_API_KEY` | _empty_ | MiniMax API key. When absent, `/api/extract` returns `{error:"missing_MINIMAX_API_KEY"}` and the UI continues without prefill. |
| `MINIMAX_MODEL` | `MiniMax-M2.5` | Model id. |
| `MINIMAX_BASE_URL` | provider default | Override only if you self-host an inference endpoint. |

## Server

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP listen port. |
| `NODE_ENV` | _unset_ | Set to `production` for a real deployment — enables the `ALLOW_NO_AUTH` guard and the `secure` cookie flag. |
