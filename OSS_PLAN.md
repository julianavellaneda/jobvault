# OSS Extraction Plan — Jules Application Tracker → Public Self-Hostable App

## Context

The current app is a Firebase-coupled personal tool for Jules + a few trusted collaborators. The AI-application SaaS market is brutally saturated (AIApply, Loopcv, Sonara, JobRight, Huntr, Teal, Careerflow…), but there's a real backlash against "spammy auto-apply" tools and clear demand for **polished, self-hostable, BYO-key trackers** (see `santifer/career-ops`, `Gsync/jobsync`). This app's actual strengths — a polished Tailwind v4 / Radix UI, fast bulk-paste flow, multi-user-by-default, hash-routed simplicity — slot directly into that niche.

**Goal:** Make this repo a public, AGPL-3.0 OSS project that anyone can self-host with `bun install && bun dev`, while the existing Vercel deployment keeps running with the same features Jules already uses, migrating off Firebase but staying hosted.

**Non-goals (explicit):** auto-apply bots, scraping job boards, hosted SaaS, payment infra, mass account creation, anything that LinkedIn could ban a user's account for.

## Decisions locked in

| Decision | Choice |
|---|---|
| Repo strategy | **Single repo, OSS-first** — current repo goes public; private Vercel keeps deploying from `main` |
| Storage backend | **SQLite only**, drop Firebase entirely. `bun:sqlite` (built into Bun) for a local file. Single Drizzle schema. |
| Auth | **Single-user no-auth by default**; optional Google/GitHub OAuth + allowlist via env for shared deployments (Jules's site stays on OAuth + allowlist) |
| License | **AGPL-3.0** — blocks SaaS repackaging, fits the "anti-spammy-auto-apply" positioning |
| AI features | Keep `/api/extract` (LLM-based link parsing). Make it **BYO API key** — user supplies their own OpenAI/Anthropic/MiniMax key via env. |

## Target architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  React UI (unchanged — pages, components, hooks signatures stable) │
└──────────────────┬──────────────────────────┬───────────────────────┘
                   │                          │
                  ┌──────▼────────┐         ┌──────▼────────┐
                  │ data adapter  │         │ auth adapter  │
                  │  (interface)  │         │  (interface)  │
                  └───────┬───────┘         └──┬─────────┬──┘
                          │                    │         │
                  ┌───────▼───────┐       ┌────▼────┐  ┌─▼─────────┐
                  │   SQLite      │       │ no-auth │  │ OAuth +   │
                  │ (bun:sqlite,  │       │ (single │  │ allowlist │
                  │  local file)  │       │  user)  │  │           │
                  └───────────────┘       └─────────┘  └───────────┘
```

Drizzle ORM sits on top of `bun:sqlite` (built into the Bun runtime). One schema, one `DATABASE_URL` shape — a local file path:
- `file:./data/app.db` (default) or bare `./data/app.db`
- `:memory:` is supported for tests.

## Repo layout after refactor

```
src/
  storage/
    adapter.ts            # DataAdapter interface (read sub + writes)
    sqlite/
      client.ts           # drizzle + bun:sqlite setup
      schema.ts           # applications, pending_urls, allowlist tables
      adapter.ts          # implements DataAdapter against drizzle
      migrations/         # drizzle-kit generated
  auth/
    adapter.ts            # AuthAdapter interface
    noauth.ts             # single-user shim (always returns synthetic user)
    oauth.ts              # Google/GitHub OAuth + allowlist check
    index.ts              # picks adapter from env at boot
  hooks/
    useApplications.ts    # rewritten to consume DataAdapter (not firestore)
    usePendingUrls.ts     # same
    useAuth.ts            # rewritten to consume AuthAdapter
  ... (rest unchanged)
api/
  _lib/
    db.ts                 # server-side drizzle client (replaces firebaseAdmin)
    requireUser.ts        # auth check via session cookie / token
  applications/           # NEW — REST endpoints (server is now the source of truth)
    list.ts
    create.ts
    update.ts
    delete.ts
  pending/
    ...
  extract.ts              # mostly unchanged; reads provider config from env
  auth/
    callback.ts           # OAuth callback handler
    me.ts                 # current user
docs/
  SELF_HOSTING.md
  CONFIGURATION.md        # env vars, AI provider setup
scripts/
  migrate-from-firebase.ts # one-time export from Firestore → local SQLite
```

## The hard architectural shift

The current app **writes to Firestore directly from the browser** (see `ApplicationRow.tsx:33,119,210,263`, `Kanban.tsx:158`, `Pending.tsx:115,135,151`, `AddLinks.tsx:78`). That works because Firestore rules enforce auth.

With SQLite, **the browser can't talk to the DB directly** — we need a thin REST API. This is the biggest change:

- All client-side `updateDoc / deleteDoc / writeBatch` calls become `fetch('/api/applications/...')`
- The realtime `onSnapshot` subscription becomes either:
  - **(simple, ship first)** polling every N seconds via SWR/react-query, OR
  - **(later)** server-sent events (`/api/applications/stream`) for live updates

For a 5-tab personal app with a handful of writes/day, polling is fine. SSE is a v2 upgrade.

## Critical files to change

| File | Change |
|---|---|
| `src/firebase.ts` | **Delete.** |
| `src/hooks/useApplications.ts` | Replace `onSnapshot` with polling fetch via DataAdapter |
| `src/hooks/usePendingUrls.ts` | Same |
| `src/hooks/useAuth.ts` | Rewrite against AuthAdapter; `no-auth` mode returns synthetic `{ uid: 'local', email: 'local@self-host' }` |
| `src/components/ApplicationRow.tsx` | Replace `updateDoc`/`deleteDoc`/`serverTimestamp` with adapter calls. Keep the 500ms debounce + `useDebouncedSaver` pattern. |
| `src/pages/Kanban.tsx` | Replace direct write on drop with adapter call; preserve appliedAt auto-stamp |
| `src/pages/Pending.tsx` | Replace `writeBatch` approve flow with `POST /api/pending/approve` (server does atomic move) |
| `src/pages/AddLinks.tsx` | Replace bulk `writeBatch` with `POST /api/pending/bulk` |
| `src/types.ts` | Replace `Timestamp \| null` with `number \| null` (epoch ms); update tests' mock |
| `src/lib/stats.ts` | Update Timestamp accessors (`.toMillis()` → direct number) — keep the pure-function shape |
| `src/lib/applicationsView.ts` | Same — update date helpers, keep tests passing |
| `api/_lib/firebaseAdmin.ts` | **Delete.** |
| `api/_lib/requireAllowedUser.ts` | Replace with `requireUser` that reads session + checks allowlist via SQL |
| `api/extract.ts` | Pluggable provider — read `AI_PROVIDER` env (`openai` \| `anthropic` \| `minimax`), pick SDK accordingly. Keep rate limiting. |
| `vercel.json` / new | API routes config for new REST endpoints |
| `.env.example` | Full rewrite — DATABASE_URL, AUTH_MODE, OAUTH_*, AI_PROVIDER, AI_API_KEY |
| `firestore.rules` | **Delete** |
| `README.md` | Rewrite as OSS landing page; move current dev notes to `docs/` |
| `LICENSE` | New, AGPL-3.0 |
| `CLAUDE.md` | Update — drop Firebase-specific conventions, document adapters |

## Reusable code that survives the migration

Per the codebase exploration, these are **storage-agnostic** and stay nearly untouched:
- `src/lib/applicationsView.ts` (sort/group helpers) — just swap Timestamp → number
- `src/lib/stats.ts` (funnel, streak, source aggregation) — same
- `src/lib/statusColors.ts` (status palette) — unchanged
- `src/lib/urls.ts` (URL parsing) — unchanged
- All UI primitives in `src/components/ui/` — unchanged
- All pages' rendering/UX logic — only the write call sites change
- All 3 test files — should pass with a Timestamp→number swap in fixtures

## Phased rollout

### Phase 1 — Foundations (no behavior change, all on a branch) ✅ DONE
1. ✅ Add `@libsql/client`, `drizzle-orm`, `drizzle-kit`. `firebase` + `firebase-admin` kept until Phase 3.
2. ✅ Drizzle schema in `src/storage/libsql/schema.ts` (3 tables: `applications`, `pending_urls`, `allowlist`). Initial migration generated.
3. ✅ `DataAdapter` (`src/storage/adapter.ts`) + `AuthAdapter` (`src/auth/adapter.ts`) interfaces defined.
4. ✅ `LibsqlDataAdapter` (`src/storage/libsql/adapter.ts`) + `NoAuthAdapter` (`src/auth/noauth.ts`) implemented. Adapter has full vitest coverage (`adapter.test.ts`). **Not wired into the UI yet** — that's Phase 3.
5. ✅ `scripts/migrate-from-firebase.ts` authored with `--dry-run` support. Not yet executed against real Firestore (deferred to Phase 3 cutover per the migration plan).
6. ✅ Bonus: `Application` / `PendingUrl` date fields swapped to `number | null` (epoch ms) ahead of schedule, with `tsToMs()` conversion in the Firestore-reading hooks. Writes still use `serverTimestamp()` because Firestore is still the live backend.

### Phase 2 — Server-side API surface ✅ DONE
1. ✅ REST endpoints live behind a no-auth shim:
   - `GET/POST /api/applications`
   - `PATCH/DELETE /api/applications/[id]` — server auto-stamps `appliedAt` on status→applied
   - `GET/POST /api/pending` (POST is bulk; hostname derived server-side)
   - `PATCH/DELETE /api/pending/[id]`
   - `POST /api/pending/[id]/approve` — atomic move via `approvePending`
2. ✅ `api/_lib/requireUser.ts(req, res)`: `AUTH_MODE=none` returns synthetic local user (rejected with 503 in production unless `ALLOW_NO_AUTH=true`); `AUTH_MODE=oauth` reads iron-session and enforces allowlist (401 / 403 / 200). Auth endpoints: `api/auth/{login,callback,me,logout}.ts` — Google OAuth, sealed cookie sessions, env-then-SQL allowlist (`api/_lib/allowlist.ts`).
3. ✅ Validation: Zod strict-parse on every write; URL fields restricted to `http:` / `https:`. Hostname is derived server-side from the URL — clients can't smuggle it.
4. ✅ Server overwrites `addedBy` / `addedByName` from the auth user on create.
5. ✅ Rate-limited writes via existing `rateLimit(email, ...)`.
6. ✅ Tests: 16 new handler tests in `api/_lib/handlers.test.ts` covering auth shim, validation, auto-stamp, atomicity, 404/405. Adapter tests still pass. Smoke script at `scripts/smoke-api.sh` for end-to-end via `vercel dev`.
7. ⏳ **Not done** (Phase 3 concern): UI still writes to Firestore. Nothing user-visible has changed yet — server side is now feature-complete.
8. ⏳ **Deferred follow-ups (small):** GitHub OAuth provider, PKCE on the OAuth flow, admin endpoints for managing the SQL `allowlist` table.

### Phase 3 — Frontend cutover ✅ DONE
1. ✅ `useApplications` / `usePendingUrls` rewritten against REST polling with optimistic per-row rollback.
2. ✅ `useAuth` rewritten against `GET /api/auth/me`.
3. ✅ All direct Firestore writes removed from `ApplicationRow`, `Kanban`, `Pending`, `AddLinks`.

### Phase 4 — OSS migration ✅ DONE (2026-05-14)
Scope expanded mid-pass: rather than keep the Vercel deployment alive in parallel, we dropped Vercel entirely and made the repo OSS-only.

1. ✅ Exported live Firestore data → `data/app.db` via `scripts/legacy/migrate-from-firebase.ts` (13 applications + 1 allowlist row). Backup at `~/jules-tracker-backup/`.
2. ✅ Replaced `api/` (Vercel serverless) with `server/` — a single Bun + Hono process that serves `dist/` and `/api/*`. Sessions via iron-session's `sealData`/`unsealData` + `hono/cookie`. Drizzle migrations apply on boot.
3. ✅ Deleted `api/`, `src/firebase.ts`, `firestore.rules`, `firebase.json`, `vercel.json`, `tmp.db`. Dropped `firebase`, `firebase-admin`, `@vercel/node` from `package.json`. Moved the migration script to `scripts/legacy/` with `firebase-admin` as an opt-in install.
4. ✅ Added `LICENSE` (AGPL-3.0), rewrote `README.md` for OSS positioning, wrote `docs/{SELF_HOSTING,CONFIGURATION,AI_PROVIDERS}.md`.
5. ✅ Dockerfile (multi-stage Bun, ~30 LOC) + `docker-compose.yml` (single service, `./data` volume, env passthrough) + `.dockerignore`.
6. ✅ GitHub Actions CI (`.github/workflows/ci.yml`) — Bun setup, install, lint, test, build on PR + push to main.
7. ✅ `.env.example` rewritten — Storage / Auth / AI / Server sections; Firebase variables removed entirely.
8. ⏳ Flip repo visibility to public — operator action, not a code change.

### Phase 5 — Polish (post-launch, prioritized by feedback)
- SSE for real-time multi-user instead of polling
- More AI providers, prompt customization
- Browser extension for one-click capture (the killer feature most OSS trackers don't have)
- CSV import/export
- Optional libSQL/Turso backend behind a build flag (only if there's demand from operators who want managed-DB replication)

## Env var shape (new)

```bash
# Storage
DATABASE_URL=file:./data/app.db                 # local SQLite path; file: prefix optional

# Auth
AUTH_MODE=none                                  # 'none' | 'oauth'
OAUTH_PROVIDER=google                           # only if AUTH_MODE=oauth
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
SESSION_SECRET=                                 # required if AUTH_MODE=oauth
ALLOWLIST=email1@x.com,email2@y.com             # comma-sep; empty = anyone signed in OK

# AI (optional — extraction degrades gracefully if absent)
AI_PROVIDER=openai                              # 'openai' | 'anthropic' | 'minimax' | 'none'
AI_API_KEY=
AI_MODEL=gpt-4o-mini                            # provider-specific

# Server
PUBLIC_BASE_URL=http://localhost:5173
```

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Live data loss during Firestore → Turso migration | Migration script supports `--dry-run`; export Firestore to JSON first as a backup; run migration during a quiet window |
| Polling feels less snappy than `onSnapshot` | 5s default interval, pause when tab hidden, immediate refetch after own write. For a personal tracker this is invisible. |
| OAuth setup is the #1 friction point for self-hosters | `AUTH_MODE=none` is the default — most self-hosters never touch OAuth. Docs explicitly recommend leaving it off for solo use. |
| AGPL scares away contributors | Acceptable trade-off — primary value is preventing SaaS repackaging, not maximizing PRs |
| Vercel free tier + Turso free tier limits | Both are generous (Turso: 500 DBs, 9GB total, 1B row reads/mo). Personal use is nowhere near limits. |

## Verification (per phase)

**Phase 1:** `bun run lint && bun run build && bun test` — all green. Migration script dry-run prints expected row counts matching Firestore.

**Phase 2:** `curl` smoke tests against each new endpoint; manual login flow works in a local dev session; allowlist denial returns 403.

**Phase 3:** Side-by-side on a staging Vercel: log in with Jules's account, verify all 5 pages render identical data, add a link, change a status, drag in Kanban, approve a pending. Compare against prod (still-on-Firebase) for parity. Stats page numbers match.

**Phase 4:** Fresh clone on a clean machine: `git clone && bun install && bun dev` → app comes up at localhost:5173 with no env file, lands on Applications page, can add a URL. Total time under 60 seconds.

## What changes for Jules's private site

Practically: a Vercel env var swap (Firebase keys out, Turso URL + OAuth client in) and a one-time data import. UX, URL, design, feature set: identical. The "eventually move to self-hosted" path then becomes: clone the repo locally, point `DATABASE_URL=file:./app.db`, export Turso → local SQLite, done.
