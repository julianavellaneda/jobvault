# Jobvault

[![CI](https://github.com/Mclovin0213/jobvault/actions/workflows/ci.yml/badge.svg)](https://github.com/Mclovin0213/jobvault/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/Mclovin0213/jobvault/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Mclovin0213/jobvault/actions/workflows/docker-publish.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![GHCR image](https://img.shields.io/badge/ghcr.io-jobvault-2496ED?logo=docker&logoColor=white)](https://github.com/Mclovin0213/jobvault/pkgs/container/jobvault)

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
    image: ghcr.io/mclovin0213/jobvault:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data        # SQLite lives here — back this up
    environment:
      AUTH_MODE: none           # single-user, no login
      ALLOW_NO_AUTH: "true"     # required for no-auth in production
    restart: unless-stopped
```

```
docker compose up -d
```

Open <http://localhost:3000>. The DB is created and migrated on first boot. For a shared deployment, switch on Google OAuth — see [Self-hosting](docs/SELF_HOSTING.md).

## Quickstart — from source

```
git clone https://github.com/Mclovin0213/jobvault.git
cd jobvault
bun install
bun run build
bun run start
```

Open <http://localhost:3000>. No env file needed for local single-user use — the default `AUTH_MODE=none` gives you a synthetic local user and `data/app.db` is created on first boot with all migrations auto-applied.

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
- **Multi-user-ready** — optional Google OAuth + allowlist for shared deployments. Default is single-user no-auth.

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
