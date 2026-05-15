# Jules Application Tracker

A polished, **self-hostable**, human-in-the-loop job-application tracker. Paste links, work through them, track momentum. **Explicitly not** auto-apply, scraping, or mass-submission — those are non-goals.

**Stack:** Vite + React 19 + React Compiler + TypeScript · Tailwind v4 · shadcn-style UI · Hono on Bun · Drizzle ORM · `bun:sqlite` · AGPL-3.0

## 30-second quickstart

```
git clone <repo-url> jules-application-tracker
cd jules-application-tracker
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
- **AI extraction (BYO key)** — `/api/extract` pulls company / role / salary / location from a posting. MiniMax provider wired today; see [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md).
- **Kanban** with drag-and-drop status changes; status flip to *applied* auto-stamps `appliedAt`.
- **Applications grid** with search, chip filters, group-by (status / source / month-added), sort-by (date added / applied / deadline / company). Two-tier rows: compact-by-default, click to expand for inline edits.
- **Pending queue** to triage before promoting to a tracked application.
- **Dashboard** — streak, applied-today, funnel, weekday heatmap, source / contributor breakdowns. All computed client-side from a single source of truth.
- **Multi-user-ready** — optional Google OAuth + allowlist for shared deployments. Default is single-user no-auth.

## Documentation

- [Self-hosting](docs/SELF_HOSTING.md) — install, persistence, upgrade, production checklist.
- [Configuration](docs/CONFIGURATION.md) — every env var explained.
- [AI providers](docs/AI_PROVIDERS.md) — wiring extraction, BYO-key model.

## Non-goals

- No auto-apply bots, scraping, or mass submission.
- No hosted SaaS — this is meant to be run by you, on your machine or your server.
- No payment infrastructure.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, you must publish your changes. This is intentional: it preserves the spirit of the project and blocks SaaS-style repackaging.
