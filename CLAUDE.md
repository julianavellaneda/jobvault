# Jules Application Tracker

Private web app for Jules to dump job-application links and track applying momentum. One primary applicant (Jules) + a few trusted collaborators (girlfriend / family) who can also add links and view stats. Trust-based: anyone in the Firestore allowlist can edit anything.

## Direction (read this before any non-trivial change)

This repo is being prepared to **go public as an AGPL-3.0 self-hostable OSS app**, while Jules's personal Vercel deployment keeps running with identical UX. See `OSS_PLAN.md` for the full plan. Headline shifts:

- **Firebase is going away.** Target backend is **Drizzle + libSQL** — local SQLite file for self-host, Turso for the hosted Vercel deployment. Single schema either way.
- **Storage adapter pattern.** All Firestore reads/writes will route through a `DataAdapter` interface; the libSQL implementation is the only one we'll ship.
- **Auth becomes pluggable.** Self-host default is single-user no-auth; Google OAuth + allowlist is opt-in via env vars (Jules's site stays on OAuth).
- **Browser-direct writes are going away.** Components currently call `updateDoc` / `writeBatch` directly. They'll move to a thin REST layer (`/api/applications/*`, `/api/pending/*`) since browsers can't talk to SQLite. Realtime `onSnapshot` becomes polling.
- **AI is BYO-key.** `/api/extract` keeps its LLM-based field extraction but reads `AI_PROVIDER` + `AI_API_KEY` from env (OpenAI / Anthropic / MiniMax pluggable).
- **Positioning:** "polished, self-hostable, human-in-the-loop application tracker." Explicitly **not** auto-apply / scraping / mass-application.

**Until the migration is executed**, the codebase is still Firebase-coupled — the conventions below describe current reality. When planning changes, prefer designs that move in the OSS_PLAN direction (e.g. keep status/sort/group logic pure and storage-agnostic; don't deepen Firestore coupling).

### Migration progress

- **Phase 1 (foundations): DONE.**
  - Date fields on `Application` / `PendingUrl` are now `number | null` (epoch ms), not `Timestamp`. `useApplications` / `usePendingUrls` convert Firestore `Timestamp` → ms at the read boundary via a `tsToMs()` helper. Writes still use `serverTimestamp()` (intentional — Firestore is the live backend until Phase 3).
  - New foundations exist as **dead code** (not imported by the UI): `src/storage/adapter.ts` (DataAdapter interface), `src/storage/libsql/{schema,client,adapter}.ts`, `src/auth/{adapter,noauth}.ts`, `drizzle.config.ts`, `src/storage/libsql/migrations/`, `scripts/migrate-from-firebase.ts` (supports `--dry-run`).
  - `LibsqlDataAdapter` has full vitest coverage in `src/storage/libsql/adapter.test.ts` (per-test temp file libSQL DB; `:memory:` doesn't share state across libsql's transaction connection pool).
  - `tsconfig.app.json` excludes `src/**/*.test.ts` so tests can use node APIs without dragging node types into the UI build.
- **Phase 2 (server-side API surface): DONE.**
  - Data endpoints: `api/applications/{index,[id]}.ts`, `api/pending/{index,[id]}.ts`, `api/pending/[id]/approve.ts`. All gated by `api/_lib/requireUser.ts(req, res)`.
  - Auth endpoints: `api/auth/{login,callback,me,logout}.ts` — Google OAuth flow (no PKCE; confidential client + sealed `oauth_state` cookie). Sessions stored in iron-session sealed cookies (`app_session`, 30-day ttl). `me.ts` returns the local synthetic user when `AUTH_MODE=none` so the Phase 3 `useAuth` hook has one shape to consume.
  - **Modes:** `AUTH_MODE=none` (default) → synthetic local user; in `VERCEL_ENV=production`/`NODE_ENV=production`, rejected with 503 unless `ALLOW_NO_AUTH=true`. `AUTH_MODE=oauth` → reads iron-session: no session = 401, session not in allowlist = 403.
  - **Allowlist** (`api/_lib/allowlist.ts`): env `ALLOWLIST` (comma-sep) wins if set; empty value = anyone signed in. If env unset, falls back to SQL `allowlist` table via `DataAdapter.listAllowedEmails()`; empty table = anyone signed in. Case-insensitive matching. Defense in depth — both `callback.ts` and `requireUser.ts` enforce.
  - **Session secret:** `SESSION_SECRET` must be ≥32 chars (iron-session requirement). `db.ts`'s `.env.local` fallback covers this for self-host `vercel dev` runs.
  - URL fields run through `httpUrlSchema` (rejects javascript:, file:, data:). Hostname on pending rows is derived server-side. Server overwrites `addedBy`/`addedByName` from the authed user on create.
  - Auto-stamp lives in `api/applications/[id].ts`: PATCH with `status:'applied'` stamps `appliedAt=Date.now()` if currently null. Once Phase 3 cuts over, the duplicated client-side rule in `ApplicationRow.tsx` + `Kanban.tsx` can be removed.
  - Handler tests at `api/_lib/handlers.test.ts` (in-memory adapter; `./session` mocked so tests don't run real iron-session crypto). Adapter tests cover `listAllowedEmails`. Smoke: `scripts/smoke-api.sh` (no-auth path; OAuth needs a real Google client and is documented inside the script).
  - **Runtime gotcha:** `tsc` honors the `@/*` alias from `api/tsconfig.json`, but Vercel's esbuild bundler does NOT. Type-only imports (`import type`) are erased so `@/` is safe; value imports in `api/` must use relative paths like `../../src/...js`.
  - **Env gotcha:** when the project is linked (`.vercel/project.json` exists), `vercel dev` pulls env from the cloud and ignores `.env.local`. `db.ts` falls back to `process.loadEnvFile('.env.local')` (Node 20.6+) when `DATABASE_URL` is missing. Cloud env still wins when both are set.
- **Phase 3 (frontend cutover):** not started. UI still writes to Firestore via `ApplicationRow`, `Kanban`, `Pending`, `AddLinks`. See `OSS_PLAN.md`.

## Stack

- **Bun** (not npm) — `bun install`, `bun dev`, `bun run build`, `bun run lint`
- Vite 8 + React 19 + **React Compiler** (already wired in `vite.config.ts` via `@rolldown/plugin-babel` + `reactCompilerPreset()`)
- TypeScript 6 with `verbatimModuleSyntax` + `erasableSyntaxOnly` — **always use `import type`** for type-only imports; no enums, no parameter properties, no namespaces
- Tailwind v4 via `@tailwindcss/vite` (single `@import "tailwindcss"` in `src/index.css`, theme tokens via CSS vars)
- Hand-rolled shadcn-style UI primitives in `src/components/ui/` (Radix + cva). Don't run `bunx shadcn` — it'll fight the TS6 setup. Add new primitives by hand following the same pattern.
- Firebase JS SDK (Auth + Firestore), `recharts`, `@dnd-kit/core`, `sonner`, `date-fns`, `lucide-react`
- Path alias: `@/*` → `src/*`

## Architecture

- **One Firestore collection: `applications`** (see `src/types.ts` for shape). Stats are computed client-side in `src/lib/stats.ts` — nothing precomputed.
- **One live data hook: `useApplications`** (`src/hooks/useApplications.ts`) — single `onSnapshot` ordered by `createdAt desc`. Every page consumes this; views stay in sync automatically.
- **Auth**: `useAuth` (`src/hooks/useAuth.ts`) → Google sign-in, then checks `allowlist/{email}` doc existence. `AuthGate` (`src/components/AuthGate.tsx`) renders sign-in / not-authorized / children.
- **Routing**: hash-based, no router lib. Tabs in `src/components/Nav.tsx`, view state in `App.tsx`.
- **Pages** in `src/pages/`: `Dashboard`, `Applications` (search + chip filters + group/sort controls + two-tier rows: compact-by-default, click to expand into inline-edit grid), `Kanban` (dnd-kit), `Pending`, `AddLinks` (bulk paste).
- **Status colors** are centralized in `src/lib/statusColors.ts` — `STATUS_BADGE`, `STATUS_COLUMN_TINT`, `STATUS_DOT`, `STATUS_BORDER`. `StatusBadge`, `Kanban`, and the Applications row left-border all consume from there. Don't duplicate status→Tailwind class maps; add new variants to that module.
- **Applications view logic** (`src/lib/applicationsView.ts`) holds the pure `sortApps` / `groupApps` / `formatShortDate` helpers + parser/default helpers. The Applications page composes them as `groupApps(sortApps(filtered, sortBy, sortDir), groupBy)`. Tested in `applicationsView.test.ts`.
- **Theme**: dark mode toggled by adding `.dark` to `<html>`, persisted to localStorage. CSS vars in `src/index.css` define both light + dark palettes. Primary accent is indigo/violet (`--primary` ≈ `oklch(... 275)`); chart palette is exposed as `--chart-1..5` (indigo / violet / cyan / emerald / amber) and mapped under `@theme inline` so charts can use `var(--color-chart-N)`.

## Conventions

- `verbatimModuleSyntax` is on — every type-only import must be `import type { ... }`. The build (`tsc -b`) will fail otherwise.
- Status changes that move to `applied` should auto-stamp `appliedAt: serverTimestamp()` if it's not already set. Both `ApplicationRow.tsx` and `Kanban.tsx` enforce this — keep the rule centralized in your head when touching either.
- Inline edits use a 500ms debounced `updateDoc`. New editable fields should follow the `EditableCell` pattern in `ApplicationRow.tsx` (don't sync prop → state in a `useEffect`; rely on `key={app.id}` for row remount).
- `ApplicationRow` only mounts the editing hooks (`useRowSaver`, `EditableCell`) when `expanded === true`. `useDebouncedSaver` auto-flushes pending writes on unmount, so collapsing a row commits in-flight edits without an explicit flush call. Don't move the saver up into the always-mounted wrapper.
- Applications page user prefs (`groupBy`, `sortBy`, `sortDir`) persist to localStorage under `applications.*` keys; row-expansion and group-collapse state are intentionally session-only.
- Bulk Firestore writes use `writeBatch` chunked at 400 ops (Firestore limit is 500).
- Toasts via `sonner` — `toast.success` / `toast.error` for any user-visible write outcome.
- ESLint config has `react-refresh/only-export-components` disabled for `src/components/ui/**` (shadcn-style files always export both components and helpers).
- Charts and themed UI should pull color from the `--color-chart-1..5` / `--color-primary` tokens, not hard-coded `oklch(...)` literals — keeps light/dark and any future palette change centralized in `src/index.css`.

## Firebase setup (also in README)

- Env vars: `VITE_FIREBASE_*` in `.env.local` (template in `.env.example`)
- Rules: `firestore.rules` deployed via `firebase deploy --only firestore:rules`
- Allowlist: manually create `allowlist/{email}` docs in Firebase console (one per allowed Google account, empty body is fine)
- After Vercel deploy, add the Vercel domain under Firebase Auth → Authorized domains

## Don'ts

- Don't add a router lib — hash routing is intentional, this is a 5-tab app
- Don't store precomputed stats in Firestore — recompute client-side from the live snapshot
- Don't run the dev server in agent commands without a real `.env.local` — Firebase init will throw
- Don't use enums, namespaces, or `import` (without `type`) for type-only symbols (TS6 will reject)
- Don't introduce per-user lists / sharing rules — explicit decision: single shared pool, trust-based edits
- Don't deepen Firestore coupling — it's being removed (see `OSS_PLAN.md`). New write call sites should be easy to reroute through a future `DataAdapter`.
- Don't add features that push toward "auto-apply" / scraping / mass submission — those are explicit non-goals for the OSS direction.

## Verify before reporting done

```
bun run lint && bun run build
```

Both must pass with no errors.
