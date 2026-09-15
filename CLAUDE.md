# Jobvault

A polished, self-hostable, human-in-the-loop application tracker. Single-process Bun server (Hono) serves the React SPA and a thin REST API on top of SQLite/libSQL. Originally a Firebase + Vercel private app; now an AGPL-3.0 OSS project that anyone can clone and run with `bun install && bun run start`.

**Explicit non-goals:** auto-apply bots, scraping, mass submission, hosted SaaS, payment infra.

## Stack

- **Bun** (not npm) — `bun install`, `bun run dev`, `bun run start`, `bun run build`, `bun run lint`, `bun run test`
- Vite 8 + React 19 + **React Compiler** (wired via `@rolldown/plugin-babel` + `reactCompilerPreset()` in `vite.config.ts`)
- TypeScript 6 with `verbatimModuleSyntax` + `erasableSyntaxOnly` — **always use `import type`** for type-only imports; no enums, no parameter properties, no namespaces
- Tailwind v4 via `@tailwindcss/vite` (single `@import "tailwindcss"` in `src/index.css`)
- shadcn-style UI primitives in `src/components/ui/` (Radix + cva). Add new primitives by hand; `bunx shadcn` fights the TS6 setup.
- **Hono** on Bun for the API (`server/`). `hono/cookie` + iron-session's `sealData`/`unsealData` for sealed-cookie sessions.
- **Drizzle ORM** + `bun:sqlite` (built into the Bun runtime). Local SQLite file at `file:./data/app.db` by default; `:memory:` is supported for tests.
- `@dnd-kit/core`, `sonner`, `date-fns`, `lucide-react`, Geist / Geist Mono fonts (`@fontsource-variable/*`). Charts are bespoke inline SVG in `src/components/charts.tsx` — no charting lib (`recharts` was dropped in 0.5.0).
- Path alias: `@/*` → `src/*` (Vite + Vitest)

## Architecture

### Server (`server/`)

`server/index.ts` is the Bun entry. It:
1. Loads `.env.local` if present (`process.loadEnvFile`).
2. Applies `secureHeaders()` (strict CSP, `frame-ancestors 'none'`, no HSTS — that's the proxy's job) to everything and `csrf()` to `/api/*`.
3. Mounts Hono routes from `server/routes/{applications,pending,auth,extract,settings}.ts`.
4. Calls `getAdapter()` once at boot, which auto-applies any pending Drizzle migrations from `src/storage/sqlite/migrations/` before opening the port. Prints the setup token if no users exist and one is required.
5. Serves `dist/` statically with a SPA fallback to `dist/index.html` (hash-routed pages survive refresh).
6. Exports `{ port, hostname, fetch }` for `Bun.serve`. `hostname` comes from `HOST` (default `127.0.0.1`, `server/lib/listenHost.ts`); the Docker image sets `0.0.0.0`, the Tauri sidecar sets `127.0.0.1`.

`parseBody` requires `Content-Type: application/json` whenever a body is present (415 otherwise) — this is part of the CSRF defence, so don't read bodies with `c.req.json()` directly.

Route handlers are thin: `requireUser(c)` → `parseBody(c, schema)` → `getAdapter()` call → `c.json(...)`.

### Storage adapter (`src/storage/`)

`DataAdapter` (`src/storage/adapter.ts`) is the interface every page consumes. `SqliteDataAdapter` (`src/storage/sqlite/adapter.ts`) is the only implementation we ship. Browser-side consumers go through `src/storage/rest/adapter.ts` (REST → server). Tests use `server/lib/testHelpers.ts`'s in-memory adapter.

### Auth (`server/lib/`)

Local username/password auth backed by SQLite. `requireUser(c)` reads the sealed session cookie, looks up the user id, and returns the row or 401. There is no OAuth, no allowlist, no `AUTH_MODE` env var. The `users` table key is `username` (3-32 chars, `[a-zA-Z0-9._-]`, case-insensitive) — no email, no separate display name.

The first user is created via `POST /api/auth/setup`, which is gated on `countUsers() === 0` and returns 410 once any user exists. When the server is bound beyond loopback, setup also requires a one-time `setupToken` (`server/lib/setupToken.ts`: random per process and printed at boot, or `SETUP_TOKEN`); `GET /api/auth/me`'s `needs-setup` payload carries `setupTokenRequired`. For Docker/CI, `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars seed the admin at startup when the DB is empty (`server/lib/bootstrap.ts`).

Login rate limiting (`routes/auth.ts`) counts **failed** attempts per client IP (5 / 5 min) and per username (20 / 15 min). `server/lib/clientIp.ts` uses the socket address via Hono `getConnInfo`; `X-Forwarded-For` (rightmost hop) only with `TRUST_PROXY=true`.

Password length has no minimum by default; the optional `MIN_PASSWORD_LENGTH` env var raises it (`server/lib/passwordPolicy.ts`, applied in `routes/auth.ts` setup + `bootstrap.ts`; the resolved value is surfaced to the SPA in the `needs-setup` payload of `GET /api/auth/me`).

Passwords are hashed with `node:crypto` scrypt (`server/lib/password.ts`). Sessions are iron-session sealed cookies (`server/lib/session.ts`) whose payload is `{ userId, sid }`; `sid` references a row in the `sessions` table (migration `0004`, cascades on user delete). `getAppSession` rejects a missing/expired/mismatched row, `destroyAppSession` deletes it, and `saveAppSession` replaces the browser's previous session. The cookie's `Secure` flag defaults to `NODE_ENV === 'production'`, overridable via `COOKIE_SECURE`.

`GET /api/auth/me` returns one of `{ status: 'needs-setup', minPasswordLength, setupTokenRequired }`, `{ status: 'signed-out' }`, `{ status: 'signed-in', user }`. The SPA's `useAuth` hook branches off that.

### AI providers (`server/lib/aiProviders.ts` + `aiConfig.ts`)

`AI_PROVIDERS` registry is the single integration point (OpenAI, Anthropic, Google, MiniMax, OpenRouter, generic OpenAI-compatible). `resolveAiConfig()` follows an env-wins / DB-fallback policy: `AI_PROVIDER` (or legacy bare `MINIMAX_API_KEY`) env wins; otherwise the single-row `ai_settings` table set via the Settings page. Both `routes/extract.ts` and `routes/settings.ts` (`/api/settings/ai{,/test}`) go through the registry. Keys are plaintext in `data/app.db` (trust model) and **never returned to the browser** — only a masked `••••last4` preview. Custom base URL applies only to `openai-compatible` (hosted providers, including MiniMax on the DB path, ignore a stored one; MiniMax's regional URL is env-only). A stored key is bound to its provider + base URL: `/ai/test` only reuses it when both match, and `PATCH /ai` clears it when either changes without a new key. A provider with no `defaultModel` isn't `ready` until a model id is set. See `docs/AI_PROVIDERS.md`.

`/api/extract` goes through `server/lib/safeUrl.ts` (parses IPv6 to bytes and unwraps embedded IPv4 — `::ffff:`, NAT64, 6to4 — before the private-range check) and `pinnedFetch.ts` (dials the validated IP, re-validates each redirect). Fetch errors are mapped to fixed codes; never return raw socket error messages.

### Frontend (`src/`)

- **One Drizzle schema, two reads**: `useApplications` / `usePendingUrls` poll `GET /api/applications` and `GET /api/pending` every 5s, pause while `document.hidden`. Writes are optimistic with per-row rollback + `toast.error` on failure. Don't snapshot the whole array for rollback — splice the affected row back in by id (or original index for removals/approves) so concurrent edits, new rows, and polled changes don't get wiped.
- `useAuth` reads `GET /api/auth/me` and branches on `status` (`needs-setup` → Setup wizard, `signed-out` → Login page, `signed-in` → app). `AuthGate` renders the right shell.
- **Routing**: hash-based, no router lib. Tabs in `src/components/Nav.tsx`, view state in `App.tsx`.
- **Pages** in `src/pages/`: `Dashboard`, `Applications`, `Kanban`, `Pending`, `AddLinks`.
- **Server-stamped `appliedAt`** — `server/routes/applications.ts` auto-stamps when status flips to `applied`. Client no longer stamps.
- **Strict-schema gotcha:** `newPendingUrlSchema` / `pendingPatchSchema` reject `hostname` (server derives it from `url`). `RestDataAdapter` strips `hostname` via `stripHostname` before POST/PATCH.

## Dev workflow

```
bun run dev        # concurrently runs vite (:5173) + bun --watch server (:3000)
# OR two terminals:
bun run dev:web    # vite only
bun run dev:api    # server only
```

Vite proxies `/api/*` to `:3000`, so you can hit either port in the browser.

For a production-shaped run:

```
bun run build && bun run start
```

## Conventions

- `verbatimModuleSyntax` is on — every type-only import must be `import type { ... }`. `tsc -b` will fail otherwise.
- Inline edits in `ApplicationRow` use a 500ms debounced PATCH via the hooks' `update`. New editable fields follow the `EditableCell` pattern (don't sync prop → state in a `useEffect`; rely on `key={app.id}` for row remount).
- `ApplicationRow` only mounts the editing hooks when `expanded === true`. `useDebouncedSaver` auto-flushes on unmount, so collapsing a row commits in-flight edits.
- Applications page user prefs (`groupBy`, `sortBy`, `sortDir`) persist to localStorage under `applications.*` keys; row-expansion + group-collapse state are session-only.
- Charts and themed UI pull color from `--color-chart-1..5` / `--color-primary` in `src/index.css` — not hard-coded `oklch(...)` literals.
- Status colors centralized in `src/lib/statusColors.ts`. Don't duplicate status→Tailwind class maps; add new variants there.
- Applications sort/group/filter logic is pure and storage-agnostic in `src/lib/applicationsView.ts`. Tested in `applicationsView.test.ts`.

## Tests

```
bun run test
```

- `server/routes/handlers.test.ts` — Hono handler tests via `app.request()`. Mocks `server/lib/db.ts` (in-memory adapter) and `server/lib/session.ts` (skip iron-session crypto). Covers auth shim, validation, auto-stamp, atomicity, 405.
- `server/routes/{auth,settings,extract}.test.ts` — setup token, login rate limiting (incl. `TRUST_PROXY`), AI key binding, SSRF + error sanitization in `fetchPage`.
- `server/lib/session.test.ts` — real iron-session sealing against the memory adapter: revocation on logout, replay, expiry, legacy cookies, `COOKIE_SECURE`.
- `server/lib/{safeUrl,rateLimit,setupToken,parseBody,htmlToText}.test.ts` — unit tests.
- `src/storage/sqlite/adapter.test.ts` — drizzle adapter exercised against an in-process `better-sqlite3` `:memory:` DB (vitest runs on Node, which can't load `bun:sqlite`). The Drizzle query API is identical across drivers, so the same `SqliteDataAdapter` is tested end-to-end.
- `src/lib/{applicationsView,stats,urls}.test.ts` — pure-function UI logic.
- `tsconfig.app.json` excludes `src/**/*.test.ts` so node-only test code doesn't pollute the SPA build.

## Don'ts

- Don't add a router lib — hash routing is intentional, this is a 5-tab app.
- Don't store precomputed stats anywhere — recompute client-side from the polled list.
- Don't use enums, namespaces, or `import` (without `type`) for type-only symbols (TS6 will reject).
- Don't introduce per-user lists / sharing rules — explicit decision: single shared pool, trust-based edits.
- Don't write to storage from the browser. All mutations go through the REST hooks (`useApplications` / `usePendingUrls`).
- Don't reintroduce Firebase or Vercel coupling. The legacy migration script lives in `scripts/legacy/` for any external Firestore migrators; it's not part of the runtime path.
- Don't add features that push toward auto-apply / scraping / mass submission — explicit non-goals.

## Verify before reporting done

```
bun run lint && bun run test && bun run build
```

All three must pass with no errors.

## Migration history

- **Phase 1** (foundations): adapters + drizzle schema + libSQL client landed as dead code; date fields swapped from Firestore `Timestamp` to `number | null` ms.
- **Phase 2** (REST surface): Vercel-shape API routes + Google OAuth + iron-session + env/SQL allowlist.
- **Phase 3** (frontend cutover): UI switched to REST polling + optimistic writes; Firebase kept alive only for the migration script.
- **Phase 4** (OSS migration): Firestore data exported to local SQLite; Vercel + Firebase code deleted; Hono-on-Bun server replaces `api/`; LICENSE/README/docs/Docker/CI shipped. Repo is OSS-ready.
- **Phase 5** (multi-provider AI): `AI_PROVIDERS` registry + `resolveAiConfig` (env-wins/DB-fallback); `ai_settings` table (migration `0001`); `/api/settings/ai` routes; in-app **Settings** page with provider/model/key + Test connection. OpenAI/Anthropic/Google/OpenRouter/OpenAI-compatible added alongside MiniMax; legacy `MINIMAX_API_KEY` still works.
- **Phase 6** (UI overhaul, v0.5.0): ground-up reskin onto a design-token system (`src/index.css`) + Geist fonts + light/dark theme toggle (Settings → Appearance). `recharts` dropped for bespoke inline-SVG charts. New shared primitives (`Chip`, `Monogram`, `SegmentedControl`, `StatusPill`). Manual **Add application** dialog with an optional URL (`optionalHttpUrlSchema`); pure form logic in `src/lib/newApplication.ts`. Dashboard gains a date-range filter.
- **Phase 7** (security hardening, v0.6.0): IPv6-aware SSRF guard, socket-IP + per-username login limits with `TRUST_PROXY`, AI keys bound to their endpoint, setup token on exposed instances, server-side `sessions` table (migration `0004`), CSRF + CSP, loopback default bind, non-root container, SHA-pinned CI + Dependabot.
