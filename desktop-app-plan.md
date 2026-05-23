# Plan: Ship Jobvault as a standalone desktop app (macOS + Linux) alongside self-host

## Context

Jobvault today is a self-hostable web app: single-process Bun/Hono server serving a React SPA on top of SQLite. The user wants to **additionally** distribute it as a downloadable desktop app for macOS (.dmg) and Linux (.AppImage / .deb), kept lightweight, **without losing the self-host story**. Same codebase, two distribution targets.

The driving constraints:
- "Lightweight" is non-negotiable → rules out Electron (~150MB baseline) in favor of **Tauri 2** (~5–15MB shell, OS-native webview).
- Must coexist with self-host → server cannot become Tauri-only.
- Minimal disruption → SPA, auth, schema, hooks, AI providers stay as-is.

The only real technical wrinkle is the **Bun runtime dependency**. Neither Tauri nor Electron bundles Bun, so the server must either ship a compiled Bun binary (heavy, ~80MB) or be made runtime-agnostic to also run on Node. Investigation showed only 3 production files touch Bun-specific APIs, and `better-sqlite3` is already proven against `SqliteDataAdapter` via the existing test suite — so runtime-agnostic is the cheap path.

## Recommended approach: Tauri 2 + runtime-agnostic server + Node sidecar

The desktop build wraps a Node-bundled copy of the existing Hono server as a Tauri **sidecar**. On launch, a tiny Rust shell starts the sidecar on a random local port and opens a webview pointing at it. Self-hosters still run `bun run start` against the same source.

Expected final sizes:
- macOS .dmg: ~40–60MB
- Linux .AppImage: ~25–40MB
- Linux .deb: similar

### Architecture

```
┌──────────────────────────────────────┐
│ Desktop app (Tauri shell, Rust)      │
│  ├─ spawns sidecar: node server.cjs  │  ── 127.0.0.1:<random>
│  ├─ webview points at sidecar URL    │
│  └─ data dir: OS app-data folder     │
└──────────────────────────────────────┘
        │ same server code              │ self-host: bun run start
        ▼                               ▼
┌──────────────────────────────────────┐
│ server/ (Hono, runtime-agnostic)     │
│  storage adapter picks bun:sqlite OR │
│  better-sqlite3 based on runtime     │
└──────────────────────────────────────┘
```

## Files to modify / add

### Make the server runtime-agnostic (3 small edits)

- **`src/storage/sqlite/client.ts`** — replace the unconditional `bun:sqlite` dynamic import with a runtime check. If `typeof Bun !== 'undefined'`, use `bun:sqlite` + `drizzle-orm/bun-sqlite`; otherwise use `better-sqlite3` + `drizzle-orm/better-sqlite3`. The `SqliteDataAdapter` already works against both (proven by `adapter.test.ts`).
- **`server/lib/db.ts`** — same conditional for `migrate` (import either `drizzle-orm/bun-sqlite/migrator` or `drizzle-orm/better-sqlite3/migrator`). The `Database` type import becomes `unknown`-typed via a shared interface.
- **`server/index.ts`** — replace `serveStatic from 'hono/bun'` with a runtime branch: keep `hono/bun` on Bun, use `@hono/node-server/serve-static` (new dep) on Node. Bind the listener through `@hono/node-server`'s `serve()` when on Node (currently the `export default { port, fetch }` pattern is Bun-specific).

These changes are additive — `bun run start` keeps working identically. ~50 LOC total.

### Add desktop shell

- **`src-tauri/`** — new directory scaffolded via `npm create tauri-app@latest` (or manually). Contains `Cargo.toml`, `tauri.conf.json`, `src/main.rs`. The Rust shell:
  1. Picks an available random port (`portpicker` crate).
  2. Resolves OS-specific app-data dir (Tauri's `app_data_dir()`): `~/Library/Application Support/Jobvault/` on macOS, `~/.local/share/jobvault/` on Linux.
  3. Reads-or-generates a 32-byte `SESSION_SECRET` stored at `<app-data>/session.key` (chmod 0600).
  4. Spawns the sidecar with `PORT`, `DATABASE_URL=file:<app-data>/app.db`, `SESSION_SECRET` env vars.
  5. Polls `/api/auth/me` until 200, then creates the webview window pointing at `http://127.0.0.1:<port>`.
  6. On window close, kills the sidecar.
- **`src-tauri/binaries/`** — per-platform Node binaries named `jobvault-server-<target-triple>` per Tauri's sidecar naming convention. Downloaded by a build script (`scripts/fetch-node-binaries.ts`) from official Node releases.
- **`scripts/build-server-bundle.ts`** — esbuild script that bundles `server/index.ts` + all deps into a single `dist-server/server.cjs`. Excludes `bun:sqlite` (resolved to a stub), includes `better-sqlite3` (native module — see note below).

### New build / dev scripts

- **`package.json`** scripts:
  - `tauri:dev` — `tauri dev` (uses `beforeDevCommand` to start Vite + a Node-side `bun run dev:api-node`)
  - `tauri:build` — runs `bun run build` + `bun run build:server` + `tauri build`
  - `build:server` — invokes `scripts/build-server-bundle.ts`
  - `dev:api-node` — runs the server on Node for desktop-dev parity (`node --experimental-strip-types server/index.ts` or via `tsx`)

### CI (additive, not breaking)

- **`.github/workflows/desktop-release.yml`** — new workflow, matrix over `macos-14` (arm64), `macos-13` (x64), `ubuntu-22.04` (x64). Triggered on `v*` tags. Builds .dmg / .AppImage / .deb, uploads to GitHub Releases. The existing Docker / self-host CI is untouched.

### Native module gotcha (one decision)

`better-sqlite3` is a native module — it has prebuilt binaries for each `(node-version, platform, arch)`. Two options:
1. **Use the prebuilt** — `npm rebuild better-sqlite3` during bundling per platform. Tauri CI matrix already runs on each target OS, so this is natural.
2. **Use `@libsql/client` (libSQL)** — pure-JS WASM build, smaller, no native compile step. Trade-off: a third sqlite driver in the codebase. **Recommend option 1** — better-sqlite3 is already a devDep, faster, and CI per-platform handles prebuilds cleanly.

### What stays untouched

- `src/**` SPA code (routes, pages, hooks, components, AI provider UI)
- `server/routes/**` route handlers
- `server/lib/{auth,session,password,bootstrap,aiProviders,aiConfig}.ts`
- Drizzle schema and migrations
- Tailwind / Vite / React Compiler / TypeScript setup
- Docker / docker-compose / self-host docs
- Existing tests

## Reused existing code / patterns

- `SqliteDataAdapter` (`src/storage/sqlite/adapter.ts`) — driver-agnostic Drizzle adapter, already works against `better-sqlite3` via `adapter.test.ts`.
- The lazy-import pattern in `src/storage/sqlite/client.ts:9-11` (comment explicitly anticipates non-Bun runtimes) — this plan just generalizes it.
- The existing `needs-setup` flow in `server/routes/auth.ts` + `useAuth` — desktop's first-launch uses the same wizard, no env-based admin seeding needed.
- `assertSessionSecret()` (`server/lib/session.ts`) — Rust shell provides the secret via env, no code change.
- The "auto-apply migrations at boot" path in `server/lib/db.ts:39-42` — works identically with better-sqlite3's migrator.

## What I deliberately considered and rejected

- **Pure Bun sidecar via `bun build --compile`** — works with zero server changes, but adds ~40MB per platform vs Node. Lightweight goal loses.
- **Electron** — heavier baseline, no real win.
- **Tauri + Rust-rewritten server** — biggest lift, no meaningful user benefit.
- **Browser-bound libSQL/WASM in the renderer (no sidecar)** — would require ripping out the REST layer and re-doing auth client-side. Massive rewrite, breaks self-host symmetry.

## Verification

After implementation, the success criteria are:

1. **Self-host unchanged**
   - `bun install && bun run start` boots, SPA loads at `:3000`, all existing tests pass: `bun run lint && bun run test && bun run build`.
   - Docker build still produces a working image.

2. **Desktop dev loop works**
   - `bun run tauri:dev` launches a window showing the SPA, server logs visible, hot-reload works for SPA changes.
   - First-launch shows the Setup wizard; creating an admin and adding an application persists to `<app-data>/app.db`.
   - Closing and reopening the app preserves data and keeps the user signed in.

3. **Desktop production build works**
   - `bun run tauri:build` on macOS produces a working `.dmg` (Apple-silicon and Intel) installable on a clean machine.
   - `bun run tauri:build` on Linux produces a working `.AppImage` and `.deb`, launches on Ubuntu 22.04.
   - Total .dmg size ≤ 70MB; .AppImage ≤ 45MB.

4. **No regressions in shared code**
   - Server route tests pass under both Bun (`bun run test`) and Node (CI runs vitest, which is already Node-only — confirms storage adapter works on Node).
   - Manual smoke: create/edit/delete an application, run AI extract, change AI provider in Settings — all work in the desktop build.

## Phasing (suggested execution order)

1. Runtime-agnostic server (3-file edit + add `@hono/node-server`, `better-sqlite3` as runtime dep). Verify `node --experimental-strip-types server/index.ts` boots and serves the SPA. Self-host CI passes.
2. `scripts/build-server-bundle.ts` produces a working `dist-server/server.cjs` that runs identically.
3. `src-tauri/` scaffold + Rust shell + sidecar wiring, with binaries downloaded for the current host platform only. `tauri:dev` works.
4. `tauri:build` produces a working bundle for the current platform.
5. CI release workflow for all three targets, signed/notarized later as a separate concern.

Steps 1 and 2 land independently and benefit the self-host story (Node compatibility) even if desktop is paused.
