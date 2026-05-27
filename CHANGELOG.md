# Changelog

All notable changes to this project are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2026-05-26

macOS bundles are now signed with a Developer ID Application certificate
and notarized by Apple, so the `.dmg` opens without Gatekeeper warnings.
(0.4.1 and 0.4.2 were broken attempts at the same release; their tagged
artifacts failed notarization and were not published.)

### Added
- **Apple code-signing + notarization in `desktop-release`.** The workflow
  imports a Developer ID Application cert into an ephemeral keychain on
  the macOS runner, then Tauri's bundler signs `jobvault-desktop`,
  `jobvault-node`, and the `.app` itself and submits the bundle to
  `notarytool` via `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`.
- **Native `.node` pre-signing inside `prepare-tauri-sidecar.ts`.**
  Tauri's bundler only signs top-level Mach-Os and never recurses into
  `Contents/Resources/`, so `better-sqlite3`'s prebuilt `better_sqlite3.node`
  would ship with `prebuild-install`'s ad-hoc signature and fail
  notarization. The prepare script now signs every `.node` it copies
  with Developer ID + secure timestamp + hardened runtime, and Tauri's
  `beforeBuildCommand` re-invocation runs the same path — so the
  signature is the last write to those files before bundling.

## [0.4.0] - 2026-05-25

Desktop app: Jobvault now ships a native desktop shell (macOS / Linux) built
on Tauri 2 alongside the existing self-host server. Same SQLite-backed app,
just packaged as a `.dmg` / `.AppImage` / `.deb` you can double-click.

### Added
- **Tauri 2 desktop shell** (`src-tauri/`). A small Rust host spawns the
  existing Hono server as a Node sidecar bound to a free localhost port,
  waits for `/api/auth/me` to come up, then opens a webview pointed at it.
  Data lives in the OS app-data dir (`~/Library/Application Support/com.jobvault.desktop/`
  on macOS, `~/.local/share/com.jobvault.desktop/` on Linux); sessions are
  sealed with a `session.key` generated on first launch (`0600`).
- **`desktop-release` GitHub Actions workflow** builds unsigned bundles for
  `aarch64-apple-darwin`, `x86_64-apple-darwin`, and `x86_64-unknown-linux-gnu`
  on tag push and attaches them to the GitHub Release.
- **In-app confirm dialog** (`src/lib/confirm.tsx`). Tauri 2's macOS webview
  disables `window.confirm()`, so delete / reject prompts now route through
  a Radix Dialog with a fallback to the native prompt when the webview
  supports it.

### Changed
- `server/index.ts` honors `DIST_DIR` so the Tauri sidecar can point at the
  bundled SPA outside the server's CWD. Behavior in the standard `bun run
  start` self-host path is unchanged.

## [0.3.1] - 2026-05-22

### Changed
- Branding refresh: replaced the placeholder "J" monogram with the Jobvault
  logo SVG in the nav, added a full favicon set (ICO + 16/32 PNGs +
  apple-touch-icon + maskable icons), and wired up a PWA web manifest with
  a matching theme color.

## [0.3.0] - 2026-05-21

Self-host onboarding: Jobvault now ships its own local authentication instead
of depending on Google OAuth, so a fresh clone is usable with nothing but
`bun install && bun run start`.

### Added
- **Local username/password authentication.** First run shows a two-step
  setup wizard (admin account + optional AI provider); subsequent visits show
  a login page. `GET /api/auth/me` drives a `needs-setup` / `signed-out` /
  `signed-in` state machine consumed by the new `useAuth` hook and `AuthGate`.
  Passwords are hashed with `node:crypto` scrypt; sessions stay iron-session
  sealed cookies.
- **Headless admin bootstrap.** Setting `ADMIN_USERNAME` + `ADMIN_PASSWORD`
  seeds the admin at startup when the database is empty — useful for Docker /
  CI deploys that skip the interactive wizard.
- **Configurable minimum password length.** `MIN_PASSWORD_LENGTH` raises the
  required password length for setup and `ADMIN_PASSWORD`. There is no
  minimum by default.

### Changed
- **Identity is now `username`** (3-32 chars, `[a-zA-Z0-9._-]`, case-insensitive)
  rather than email — no separate display name.
- Initial user creation is atomic, closing a first-run race where concurrent
  `POST /api/auth/setup` requests could both succeed.
- `requireUser` resolves the session to a local DB row; the `AUTH_MODE` env
  var is gone.

### Removed
- Google OAuth and the email allowlist. Jobvault is single-user / trust-based;
  there is no OAuth, no allowlist, and no `AUTH_MODE`.

## [0.2.1] - 2026-05-20

### Security
- **SSRF / DNS rebinding (`POST /api/extract`).** The pre-fetch hostname check
  in `server/lib/safeUrl.ts` validated resolved IPs but the subsequent
  `fetch()` re-resolved the hostname, leaving a TOCTOU window. A low-TTL DNS
  record could resolve to a public IP at validation and a private IP
  (`169.254.169.254`, RFC1918, loopback) at connect time. On cloud-hosted
  self-deployments this could be used to reach the instance metadata service
  and exfiltrate IAM credentials via the LLM's structured-output path.
  Now the validated IP is pinned through to the socket via the new
  `server/lib/pinnedFetch.ts` (Host header + TLS SNI preserved; cert
  validation runs against the original hostname). The pin is reapplied on
  every redirect hop.
- **LLM parse-failure echo (`/api/extract`).** The `llm_unparseable_json`
  error path used to echo up to 300 chars of raw LLM output to the response,
  which was a viable side channel for the SSRF above (and could surface page
  content in error responses). The endpoint now returns a canned
  `llm_unparseable_json`; verbose detail is still logged behind
  `DEBUG_EXTRACT=true`.
- **AI test-endpoint error classification (`POST /api/settings/ai/test`).**
  Upstream SDK errors were reflected back as `e.message.slice(0, 300)`. With
  the `openai-compatible` provider this turned the test endpoint into a probe
  for internal HTTP services. Errors are now collapsed to a fixed vocabulary:
  `auth_error` / `model_not_found` / `network_error` / `timeout` /
  `rate_limited` / `test_failed`.
- **AI `baseUrl` validation.** `aiSettingsPatchSchema` / `aiTestSchema` now
  require `baseUrl` to be empty or a parseable `http(s)://` URL. Loopback /
  RFC1918 targets are still accepted (Ollama / LM Studio remain in scope);
  exotic schemes are not.

### Credits
Self-disclosed via internal security review on 2026-05-20.

## [0.2.0] - 2026-05-20

### Changed
- Gated chatty `[extract]` logs behind `DEBUG_EXTRACT=true`. The user email
  is no longer logged on every extract call by default.
- Added Open Graph / Twitter card metadata to `index.html` so shared links
  render a proper preview.

### Added
- README hero demo video plus Dashboard / Applications / Kanban screenshots
  under `docs/screenshots/`.

### Docs
- Moved internal `OSS_PLAN.md` under `docs/internal/` so it stays out of the
  public repo root.
- Documented `DEBUG_EXTRACT` in `.env.example` and `docs/CONFIGURATION.md`.

## [0.1.1] - 2026-05-18

### Changed
- Renamed the project to **Jobvault**.
- Hardened AI provider configuration: stricter per-provider key handling and
  tightened rate limiting on `/api/extract`.

## [0.1.0] - 2026-05-16

Initial OSS release.

### Added
- Single-process Bun + Hono server serving the React SPA and REST API.
- SQLite storage via Drizzle ORM and `bun:sqlite`, with auto-applied migrations
  on boot.
- Multi-provider AI extraction (OpenAI, Anthropic, Google, MiniMax,
  OpenRouter, OpenAI-compatible) with env-wins / DB-fallback config and a
  Settings page for in-app provider/model/key management.
- Google OAuth + env/SQL allowlist for optional shared deployments. Default
  `AUTH_MODE=none` for single-user self-host; fail-closed in production unless
  `ALLOW_NO_AUTH=true` is explicit.
- Dashboard (streak, funnel, weekday heatmap), Applications grid with
  group/sort/filter and expandable rows, Kanban board with drag-and-drop, bulk
  paste + pending triage.
- Multi-arch Docker image (amd64 + arm64) published to GHCR, GitHub Actions
  CI, and OSS scaffolding (AGPL-3.0 license, CONTRIBUTING, CODE_OF_CONDUCT,
  SECURITY policy, issue/PR templates).

[Unreleased]: https://github.com/julianavellaneda/jobvault/compare/v0.4.3...HEAD
[0.4.3]: https://github.com/julianavellaneda/jobvault/compare/v0.4.0...v0.4.3
[0.4.0]: https://github.com/julianavellaneda/jobvault/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/julianavellaneda/jobvault/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/julianavellaneda/jobvault/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/julianavellaneda/jobvault/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/julianavellaneda/jobvault/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/julianavellaneda/jobvault/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/julianavellaneda/jobvault/releases/tag/v0.1.0
