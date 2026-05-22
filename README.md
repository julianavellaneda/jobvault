# Jobvault

[![CI](https://github.com/julianavellaneda/jobvault/actions/workflows/ci.yml/badge.svg)](https://github.com/julianavellaneda/jobvault/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/julianavellaneda/jobvault/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/julianavellaneda/jobvault/actions/workflows/docker-publish.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![GHCR image](https://img.shields.io/badge/ghcr.io-jobvault-2496ED?logo=docker&logoColor=white)](https://github.com/julianavellaneda/jobvault/pkgs/container/jobvault)

A polished, **self-hostable**, human-in-the-loop job-application tracker. Paste links, work through them, track momentum. **Explicitly not** auto-apply, scraping, or mass-submission — those are non-goals.

**Stack:** Vite + React 19 + React Compiler + TypeScript · Tailwind v4 · shadcn-style UI · Hono on Bun · Drizzle ORM · `bun:sqlite` · AGPL-3.0. Single process, one SQLite file, no external services required. Typically <50 MB RAM.

## Screenshots

| Dashboard | Applications | Kanban |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Applications](docs/screenshots/applications.png) | ![Kanban](docs/screenshots/kanban.png) |

## Quickstart — Docker (recommended)

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/julianavellaneda/jobvault:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data        # SQLite lives here — back this up
    environment:
      SESSION_SECRET: ${SESSION_SECRET}   # required; openssl rand -base64 48
    restart: unless-stopped
```

```
docker compose up -d
```

Open <http://localhost:3000>. The DB is created and migrated on first boot.

## First run

1. Start the app (Docker above, or `bun install && SESSION_SECRET=$(openssl rand -base64 48) bun run start`).
2. Open <http://localhost:3000>. You'll see a one-time setup form — pick a username (3-32 characters) and a password (12+ characters). That account becomes the admin.
3. Optionally configure an AI provider in step 2 of the setup, or skip and set it up later under **Settings**.

### Headless / declarative bootstrap

If you'd rather not visit a browser to set up, pass both env vars at first start and the admin will be created automatically:

```bash
docker run \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e SESSION_SECRET=$(openssl rand -base64 48) \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='a-long-passphrase-or-random-string' \
  ghcr.io/julianavellaneda/jobvault:latest
```

These env vars are only read when the database is empty — they don't override an existing user, and they're safe to leave in your compose file after setup.

### Lost the admin password?

There's no password-reset flow (Jobvault is self-hosted and doesn't ship an SMTP integration). Recover by clearing the users table and re-running setup:

```bash
docker compose exec app sqlite3 /app/data/app.db 'DELETE FROM users;'
docker compose restart app
```

Your applications and pending URLs are untouched.

## Quickstart — from source

```
git clone https://github.com/julianavellaneda/jobvault.git
cd jobvault
bun install
bun run build
SESSION_SECRET=$(openssl rand -base64 48) bun run start
```

Open <http://localhost:3000> and complete the one-time setup. `data/app.db` is created on first boot with all migrations auto-applied.

For development with hot reload:

```
cp .env.example .env.local        # optional — defaults are fine for solo use
bun run dev                       # vite on :5173, server on :3000
```

Vite proxies `/api/*` to the Bun server, so you can use either port during dev.

## Features

- **Bulk paste** — drop a list of job URLs and the server validates + dedupes.
- **AI extraction (BYO key)** — `/api/extract` pulls company / role / salary / location from a posting. Pluggable providers: **OpenAI, Anthropic, Google, MiniMax, OpenRouter, or any OpenAI-compatible endpoint** (Ollama / LM Studio / vLLM). Configure via env or the in-app **Settings** page; keys never leave your DB. See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md).
- **Kanban** with drag-and-drop status changes; status flip to *applied* auto-stamps `appliedAt`.
- **Applications grid** with search, chip filters, group-by (status / source / month-added), sort-by (date added / applied / deadline / company). Two-tier rows: compact-by-default, click to expand for inline edits.
- **Pending queue** to triage before promoting to a tracked application.
- **Dashboard** — streak, applied-today, funnel, weekday heatmap, source / contributor breakdowns. All computed client-side from a single source of truth.
- **Self-host first** — username/password auth backed by local SQLite, set up in-app on first run or via `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars for headless deploys. Sessions are sealed cookies (iron-session); passwords are scrypt-hashed.

## Documentation

- [Self-hosting](docs/SELF_HOSTING.md) — install, persistence, upgrade, reverse proxy, production checklist.
- [Configuration](docs/CONFIGURATION.md) — every env var explained.
- [AI providers](docs/AI_PROVIDERS.md) — wiring extraction, BYO-key model.
- [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md)

## Non-goals

- No auto-apply bots, scraping, or mass submission.
- No hosted SaaS — this is meant to be run by you, on your machine or your server.
- No payment infrastructure.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, you must publish your changes. This is intentional: it preserves the spirit of the project and blocks SaaS-style repackaging.
