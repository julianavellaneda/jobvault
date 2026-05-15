# Self-hosting

This app is designed to run as a single Bun process serving both the React SPA and the REST API. The default storage is a local SQLite file, so a fresh install needs no infrastructure besides Bun.

## Prerequisites

- [Bun](https://bun.sh) 1.x. Node is not required at runtime.
- A POSIX shell. Linux, macOS, and WSL are all fine.

## Install

```
git clone <repo-url> jules-application-tracker
cd jules-application-tracker
bun install
bun run build
bun run start
```

Open <http://localhost:3000>. On first boot:

- `data/app.db` is created if missing.
- Drizzle migrations from `src/storage/sqlite/migrations/` are applied automatically.
- With the default `AUTH_MODE=none`, you sign in as a synthetic local user — no OAuth setup required.

## Configuration

Copy `.env.example` to `.env.local` and edit. Every variable is documented in [CONFIGURATION.md](CONFIGURATION.md). The defaults work for local single-user use.

## Persistence

All data lives in `data/app.db` (set by `DATABASE_URL=file:./data/app.db`). Back up by copying the file while the server is stopped or with `.backup` in `sqlite3`:

```
sqlite3 data/app.db ".backup data/app-$(date +%F).db"
```

## Upgrades

```
git pull
bun install
bun run build
bun run start
```

Migrations apply automatically at boot. If a migration fails, the server exits before opening the port — your DB stays untouched.

## Production checklist

For anything beyond a localhost-only personal install:

1. **Auth.** Either set `AUTH_MODE=oauth` with Google credentials, or run behind a reverse proxy / VPN with `AUTH_MODE=none` + `ALLOW_NO_AUTH=true`. The server refuses to start with `AUTH_MODE=none` in production unless `ALLOW_NO_AUTH=true` is explicit — this is the guard against accidentally exposing an open instance.
2. **`SESSION_SECRET`** must be ≥ 32 characters. Generate one with `openssl rand -base64 32`.
3. **`PUBLIC_BASE_URL`** should be the public origin (e.g. `https://tracker.example.com`). It's used to build the OAuth redirect URI.
4. **TLS** must be terminated upstream (nginx, Caddy, Cloudflare). Bun serves plain HTTP.

## Docker

```
docker compose up --build
```

Single container, listens on `:3000`, persists to `./data` via a bind mount. Edit `.env.local` and `docker-compose.yml` (or pass env vars directly) to enable OAuth.

## Migrating from an existing Firestore-backed instance

A one-shot script lives at `scripts/legacy/migrate-from-firebase.ts`. It's not part of the default install — `firebase-admin` is intentionally not a project dependency. To run it:

```
bun add -d firebase-admin
FIREBASE_PROJECT_ID=... \
FIREBASE_CLIENT_EMAIL=... \
FIREBASE_PRIVATE_KEY="..." \
DATABASE_URL=file:./data/app.db \
bun run scripts/legacy/migrate-from-firebase.ts --dry-run
```

Drop `--dry-run` once the row counts look right.
