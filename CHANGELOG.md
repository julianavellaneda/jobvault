# Changelog

All notable changes to this project are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/julianavellaneda/jobvault/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/julianavellaneda/jobvault/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/julianavellaneda/jobvault/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/julianavellaneda/jobvault/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/julianavellaneda/jobvault/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/julianavellaneda/jobvault/releases/tag/v0.1.0
