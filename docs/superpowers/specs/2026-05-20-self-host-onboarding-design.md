# Self-host Onboarding: Local Auth + First-Run Setup

**Status:** Draft for review
**Date:** 2026-05-20
**Scope:** Replace Google OAuth + email allowlist with local user/password auth, gated by a first-run `/setup` flow modeled on Immich and Paperless-ngx.

## Goal

Make Jobvault trivial to stand up for a beginner homelabber:

```
docker run -p 3000:3000 -v ./data:/app/data -e SESSION_SECRET=... jobvault
# open http://localhost:3000 → setup form → done
```

No env-var literacy required, no OAuth client to provision, no allowlist to maintain. The previous SaaS-shaped auth path (Google OAuth + email allowlist + synthetic local user) is removed.

## Non-goals

- Multi-user support (single admin only in v1; schema allows future expansion).
- In-app SSO (users who want SSO front the app with Authelia/Authentik/forward-auth).
- Password reset email flow (no SMTP; documented manual recovery instead).
- Collecting job-search profile fields (target role, keywords) before any feature consumes them.
- Importing or rewriting existing application data (`addedBy` strings stay as-is).

## Architecture

### Three top-level UI states, driven by `GET /api/auth/me`

| Backend state | Response | Frontend renders |
|---|---|---|
| No users in DB | `200 { status: 'needs-setup' }` | `Setup.tsx` |
| Users exist, no session | `200 { status: 'signed-out' }` | `Login.tsx` |
| Signed in | `200 { status: 'signed-in', user: {...} }` | Main app |

Always 200 — the frontend branches on `status`, not status codes. Polling stays at 5s like the other hooks.

### Flow diagram

```
First boot
   ↓
Server starts → migrations run → bootstrap() checks user count
   ├── ADMIN_EMAIL+ADMIN_PASSWORD env set, count==0 → create admin, log "admin bootstrapped"
   └── otherwise → no-op
   ↓
Browser loads /
   ↓
useAuth → GET /api/auth/me
   ├── needs-setup → <Setup>
   │     ↓
   │   Step 1: name + email + password → POST /api/auth/setup
   │     ↓  (server creates user + sets session cookie atomically)
   │   Step 2: AI provider (or Skip) → POST /api/settings/ai
   │     ↓
   │   redirect to main app
   ├── signed-out → <Login>
   │     ↓
   │   email + password → POST /api/auth/login
   │     ↓  (server verifies + sets session cookie)
   │   redirect to main app
   └── signed-in → main app
```

## Backend changes

### New file: `src/storage/sqlite/schema.ts` — `users` table

```ts
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                          // crypto.randomUUID()
  email: text('email').notNull().unique(),              // lowercased on write
  passwordHash: text('password_hash').notNull(),        // node:crypto scrypt, format: `scrypt$N$r$p$salt_b64$hash_b64`
  displayName: text('display_name').notNull(),
  role: text('role').$type<'admin'>().notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
})
```

### New migration `0002_local_auth.sql`

```sql
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `display_name` text NOT NULL,
  `role` text DEFAULT 'admin' NOT NULL,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

DROP TABLE `allowlist`;
```

The allowlist table is dropped in the same migration. Pre-1.0 cleanup, no data we care about.

### New file: `server/lib/users.ts`

```ts
import { getAdapter } from './db.ts'

export interface LocalUser { id, email, displayName, role: 'admin', createdAt }

export async function countUsers(): Promise<number>
export async function findUserByEmail(email: string): Promise<LocalUser | null>
export async function findUserById(id: string): Promise<LocalUser | null>
export async function createUser(input: { email, password, displayName }): Promise<LocalUser>
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean>
```

Hashing uses `node:crypto` `scryptSync` (memory-hard, NIST-recommended). Parameters: `N=2^15, r=8, p=1, keylen=64, salt=16 random bytes`. Stored as `scrypt$N$r$p$salt_b64$hash_b64` so future tuning is forward-compatible. Verification uses `crypto.timingSafeEqual`. Works identically under Bun and Node, so vitest tests run unchanged. No new dependency.

### Rewritten `server/lib/requireUser.ts`

```ts
export async function requireUser(c: Context): Promise<UserResult> {
  const session = await getAppSession(c)
  if (!session.userId) return { ok: false, status: 401, error: 'unauthenticated' }
  const user = await findUserById(session.userId)
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }
  return { ok: true, user }
}
```

No `AUTH_MODE`, no `ALLOW_NO_AUTH`, no allowlist check. The synthetic `local@self-host` user is gone.

### Updated `server/lib/session.ts`

Session payload becomes `{ userId: string }` instead of `{ user: StoredUser }`. The `OAuthStateSession` and `oauth_state` cookie helpers are deleted. `readSessionUser` becomes `readSessionUserId`.

### Rewritten `server/routes/auth.ts`

| Route | Body | Behavior |
|---|---|---|
| `GET /api/auth/me` | — | Returns one of the three states above. Counts users + checks session. |
| `POST /api/auth/setup` | `{ displayName, email, password }` | **Only succeeds if `countUsers() === 0`.** Otherwise 410. Creates admin, sets session cookie, returns `{ status: 'signed-in', user }`. |
| `POST /api/auth/login` | `{ email, password }` | Verifies, sets session cookie, returns `{ status: 'signed-in', user }`. Rate-limited via existing `rateLimit` helper (5/min per IP). Generic "invalid credentials" on any failure (no email-enumeration leak). |
| `POST /api/auth/logout` | — | Clears `app_session` cookie, returns 204. |

OAuth routes (`/login` redirect, `/callback`) are deleted.

### New file: `server/lib/bootstrap.ts`

Called once from `server/index.ts` after `getAdapter()` (which runs migrations) and before `Bun.serve`.

```ts
export async function maybeBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  if ((await countUsers()) > 0) return
  await createUser({
    email,
    password,
    displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || email.split('@')[0],
  })
  console.log(`[bootstrap] Created admin user ${email} from ADMIN_EMAIL/ADMIN_PASSWORD env vars.`)
}
```

If the env vars are present but a user already exists, log nothing and move on. If `ADMIN_PASSWORD` is weak (< 12 chars), refuse to boot with a clear error — don't silently downgrade security.

### Files deleted

- `server/lib/oauthGoogle.ts`
- `server/lib/allowlist.ts`
- Allowlist-related lines from `server/lib/db.ts` (adapter methods + types) and `src/storage/adapter.ts`
- `src/auth/adapter.ts` — replaced by `server/lib/users.ts` types (the SPA only needs the shape returned by `/api/auth/me`, so a small `src/types.ts` addition covers it)

### Rate limiting

- `POST /api/auth/login` — 5/min per client IP (existing helper).
- `POST /api/auth/setup` — 10/min per client IP, but the route itself returns 410 once a user exists, so this is just belt-and-suspenders against the bootstrap window.

### Password requirements

- 12 characters minimum. No complexity rules (current NIST guidance).
- Enforced in `parseBody` Zod schemas for both `setup` and `login` (login validates length to avoid timing leaks but rejects without hashing if shorter than min, after a constant-time dummy hash).
- Display name: 1–80 chars, no other constraints.

## Frontend changes

### New: `src/pages/Setup.tsx`

Two steps, single page (no router), step state held in component.

**Step 1 — Account**

- Inputs: Display name, Email, Password, Confirm password.
- Inline validation: email format, password ≥ 12, passwords match.
- Submit → `POST /api/auth/setup` → on 200, store user via `useAuth`'s cache key and advance to step 2.

**Step 2 — AI provider (optional)**

- Reuses the existing Settings page's provider/model/key fields (extracted into a shared component if needed — or just duplicated; this is a one-time form, low value to abstract).
- Two buttons: "Save and continue" (calls `POST /api/settings/ai`) and "Skip — I'll set this up later" (navigates straight to main app).
- "Test connection" button calls existing `POST /api/settings/ai/test`.

### New: `src/pages/Login.tsx`

Single form: email + password → `POST /api/auth/login`. On success, `useAuth` re-fetches and the app renders. On 401, show generic error. No "forgot password" link — docs mention manual recovery.

### Updated: `src/hooks/useAuth` (or wherever it lives)

- Polls `GET /api/auth/me`.
- Exposes `{ status, user }` where status is `'needs-setup' | 'signed-out' | 'signed-in' | 'loading'`.
- Exposes `logout()` and `refresh()`.

### Updated: `App.tsx`

Top-level switch on `useAuth().status`:
- `loading` → splash
- `needs-setup` → `<Setup />`
- `signed-out` → `<Login />`
- `signed-in` → existing app (Nav + pages)

### Updated: `src/components/Nav.tsx`

Adds a "Log out" item in the user menu (currently shows the email for OAuth users — keep that, source it from `useAuth().user.displayName`).

### Updated: `src/storage/rest/adapter.ts`

No changes to the data adapter itself. The REST adapter already sends cookies; sessions just carry a different payload now.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | yes | iron-session sealing key, ≥ 32 chars (existing) |
| `ADMIN_EMAIL` | no | Headless bootstrap (Docker/CI declarative config) |
| `ADMIN_PASSWORD` | no | Headless bootstrap, ≥ 12 chars |
| `ADMIN_DISPLAY_NAME` | no | Defaults to email's local-part |

**Removed:** `AUTH_MODE`, `ALLOW_NO_AUTH`, `ALLOWLIST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. README + `.env.example` + Docker compose all updated.

## Migration story (existing self-hosters)

There is exactly one cohort: people running v0.2.x in `AUTH_MODE=none` + `ALLOW_NO_AUTH=true` mode (synthetic `local@self-host` user). For them:

1. Pull the new image, restart.
2. Migration `0002` runs: creates `users` (empty), drops `allowlist`.
3. First page load redirects to `/setup`.
4. They create their account. Done.
5. Their existing applications and pending URLs are untouched. The `addedBy` field on old rows stays as whatever it was (`local@self-host` or an old OAuth email) — purely cosmetic, will fall off naturally as old rows are archived or edited.

Anyone running `AUTH_MODE=oauth` for real (none of the public OSS releases ship this configured by default — it was the legacy SaaS path) sees the same migration: their session cookie still validates, but `requireUser` no longer reads `session.user`, only `session.userId`, so they get a `signed-out` state and need to set up via `/setup`. They lose their old per-user data attribution but no actual data. This is acceptable for pre-1.0.

## Testing

New tests in `server/routes/handlers.test.ts`:

- `POST /api/auth/setup` succeeds when `users` is empty; returned session cookie authenticates subsequent requests.
- `POST /api/auth/setup` returns 410 when a user already exists.
- `POST /api/auth/setup` rejects passwords < 12 chars (400).
- `POST /api/auth/login` succeeds with valid creds.
- `POST /api/auth/login` returns 401 generic error for bad email or bad password (no leak).
- `POST /api/auth/login` rate-limits after 5 attempts.
- `GET /api/auth/me` returns the three states correctly given DB + session combinations.
- `POST /api/auth/logout` clears the cookie.

New tests in `server/lib/users.test.ts`:

- `verifyPassword` round-trips against `hashPassword` output.
- `verifyPassword` returns false on tampered hash strings without throwing.
- `findUserByEmail` is case-insensitive.

New tests in `server/lib/bootstrap.test.ts`:

- `maybeBootstrapAdmin` creates a user when env vars are set and DB is empty.
- It does nothing when DB is non-empty.
- It refuses to start (throws) when `ADMIN_PASSWORD` < 12 chars.

Old tests removed: anything referencing `AUTH_MODE`, `ALLOW_NO_AUTH`, `ALLOWLIST`, OAuth callback.

## Security checklist

- [x] No default admin/admin credentials.
- [x] `/setup` self-locks (server-side check on every request, not client-side).
- [x] Login error message is generic ("invalid email or password") — no email enumeration.
- [x] Constant-time-ish login: if user not found, still run `Bun.password.verify` against a dummy hash to avoid timing distinguishing existing vs missing accounts.
- [x] scrypt (memory-hard, NIST-recommended), not bcrypt or PBKDF2.
- [x] Passwords never logged, never returned, never stored in cookies.
- [x] `httpOnly` + `secure` (in prod) + `SameSite=Lax` session cookie (existing).
- [x] Rate limit on `/api/auth/login`.
- [x] Bootstrap env vars validated (password length) at startup, not silently accepted.

## Docs updates

- `README.md`: replace the OAuth/allowlist section with a "First run" section ("open the URL, fill in the form"). Add an "Advanced: headless bootstrap" subsection covering `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Add a "Recovery" section: "Lost your password? Stop the container, run `sqlite3 data/app.db 'DELETE FROM users;'`, restart, and the setup flow will appear again."
- `.env.example`: keep `SESSION_SECRET`, add commented `ADMIN_EMAIL`/`ADMIN_PASSWORD`, remove OAuth/allowlist.
- `docker-compose.yml`: remove OAuth env vars.
- `docs/AI_PROVIDERS.md`: unaffected (the AI step in setup is purely a UI wrapper around the existing endpoints).

## Out of scope / future work

- Settings → Change password (post-v1, trivial once `users.ts` exists).
- Multi-user with invite links and per-user data scoping.
- Password reset via SMTP.
- A "Profile" Settings tab capturing target role / keywords — landed together with the first feature that consumes them.
- Optional in-app TOTP (probably never; forward-auth handles this better).

## File-level summary

**New:**
- `src/storage/sqlite/migrations/0002_local_auth.sql`
- `server/lib/users.ts`
- `server/lib/bootstrap.ts`
- `server/lib/users.test.ts`
- `server/lib/bootstrap.test.ts`
- `src/pages/Setup.tsx`
- `src/pages/Login.tsx`

**Rewritten:**
- `server/lib/requireUser.ts`
- `server/lib/session.ts`
- `server/routes/auth.ts`
- `src/storage/sqlite/schema.ts` (add `users`, remove `allowlist`)
- `server/lib/db.ts` (drop allowlist adapter methods)
- `src/App.tsx` (top-level auth state branch)
- `src/components/Nav.tsx` (real logout)

**Deleted:**
- `server/lib/oauthGoogle.ts`
- `server/lib/allowlist.ts`
- `src/auth/adapter.ts` (replaced by inline types)

**Touched (docs/config):**
- `README.md`, `.env.example`, `docker-compose.yml`, `CLAUDE.md`
