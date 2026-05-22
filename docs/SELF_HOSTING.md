# Self-hosting

This app is designed to run as a single Bun process serving both the React SPA and the REST API. The default storage is a local SQLite file, so a fresh install needs no infrastructure besides Bun.

## Prerequisites

- [Bun](https://bun.sh) 1.x. Node is not required at runtime.
- A POSIX shell. Linux, macOS, and WSL are all fine.

## Install

```
git clone https://github.com/julianavellaneda/jobvault.git
cd jobvault
bun install
bun run build
bun run start
```

Open <http://localhost:3000>. On first boot:

- `data/app.db` is created if missing.
- Drizzle migrations from `src/storage/sqlite/migrations/` are applied automatically.
- The first page load shows a one-time setup form. Pick a username (3-32 chars) and password (12+ chars) — that creates the admin user. For headless / Docker deploys, set `ADMIN_USERNAME` + `ADMIN_PASSWORD` instead and the admin is created at boot.

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

1. **`SESSION_SECRET`** is required and must be ≥ 32 characters. Generate one with `openssl rand -base64 48`. The server refuses to start without it.
2. **Bootstrap the admin** either via the in-app setup form (visit the site once and create the account) or via `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars (created at first boot when the DB is empty).
3. **TLS** must be terminated upstream (nginx, Caddy, Cloudflare). Bun serves plain HTTP.

## Docker

The shipped `docker-compose.yml` pulls a prebuilt multi-arch image (amd64 + arm64) from GHCR:

```
docker compose up -d
```

Single container, listens on `:3000`, persists to `./data` via a bind mount. To build from source instead, comment the `image:` line and uncomment `build: .` in `docker-compose.yml`. Set env vars in a `.env` file next to the compose file (or in your orchestrator) to bootstrap the admin and/or AI extraction — see [CONFIGURATION.md](CONFIGURATION.md).

The container ships a `HEALTHCHECK` (Docker/Portainer/Watchtower will report health). Image tags follow SemVer (`v1.2.3`, `1.2`, `latest`) so Watchtower/Renovate can track updates.

## Behind a reverse proxy (TLS)

Bun serves plain HTTP; terminate TLS upstream.

**Caddy** (auto HTTPS via Let's Encrypt):

```
tracker.example.com {
    reverse_proxy localhost:3000
}
```

**nginx:**

```
server {
    listen 443 ssl;
    server_name tracker.example.com;
    # ssl_certificate / ssl_certificate_key ...
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

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
