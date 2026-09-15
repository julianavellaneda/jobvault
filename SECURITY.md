# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/julianavellaneda/jobvault/security/advisories/new)
(Security → Report a vulnerability). I aim to acknowledge reports within 72 hours
and to ship a fix or mitigation for confirmed issues as quickly as is practical
for a solo-maintained project.

When reporting, please include reproduction steps, the affected version/commit,
and the impact you observed.

## Supported versions

Only the latest released version (`v0.x` line) receives security fixes. This is
an early-stage project; pin to a tag and watch releases.

## Trust model — read this before exposing an instance

Jobvault is a **single shared pool, trust-based** app. There are no per-user data
boundaries: anyone who can authenticate can read and edit every record. This is
an intentional design decision for the "me / my small group" use case, not a bug.

Specific things operators should know:

- **Auth is local username/password.** Passwords are scrypt-hashed (`node:crypto`)
  and compared in constant time; unknown usernames cost the same as wrong
  passwords. The first user is created via an in-app setup form gated on an
  empty users table, or by setting `ADMIN_USERNAME` + `ADMIN_PASSWORD` at first
  boot for headless deploys.
- **First-run setup on an exposed instance needs a token.** When the server
  listens on anything other than loopback (e.g. Docker's `HOST=0.0.0.0`), the
  setup form requires a one-time token printed to the server logs, so whoever
  reaches a fresh instance first can't claim the admin account.
- **Bind address.** The server listens on `127.0.0.1` unless `HOST` says
  otherwise; the desktop app's sidecar is always loopback-only.
- **Login rate limiting** counts failed attempts per client IP and per username.
  The client IP is the socket address; `X-Forwarded-For` is only trusted with
  `TRUST_PROXY=true`, so set that behind a reverse proxy and not otherwise.
- **AI provider API keys are stored in plaintext** in the SQLite database
  (`data/app.db`). The trust boundary is the filesystem: protect that file with
  OS permissions and don't commit it. Keys are never returned to the browser —
  the Settings page only shows a masked `••••last4` preview.
- **TLS is not handled by the app.** Bun serves plain HTTP; terminate TLS at an
  upstream reverse proxy (Caddy / nginx / Cloudflare). See `docs/SELF_HOSTING.md`.
- **Sessions** are sealed cookies (iron-session) that point at a server-side
  session row, so logging out revokes the session rather than just clearing the
  cookie. `SESSION_SECRET` must be ≥ 32 chars and kept secret; rotating it
  invalidates all sessions. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure`
  in production (override with `COOKIE_SECURE`).
- **Browser hardening.** Responses carry a strict Content-Security-Policy
  (`default-src 'self'`, `frame-ancestors 'none'`) and the usual security
  headers. State-changing API calls must be `application/json`, and cross-site
  form posts are rejected by an Origin / `Sec-Fetch-Site` check.
- **Outbound fetches** (`/api/extract`) resolve and validate the target first —
  rejecting loopback, private, link-local, and IPv4-embedded-in-IPv6 forms —
  then pin the validated IP to the socket and re-check every redirect.
  The `openai-compatible` AI provider is deliberately allowed to reach local
  addresses (Ollama, LM Studio); a stored API key is only ever sent to the base
  URL it was saved with.
- **The container runs as an unprivileged user** (`bun`); the entrypoint only
  uses root to fix ownership of the data volume.

Reports that amount to "the trust model is permissive by design" (e.g. one
admin can edit another admin's rows) are known and out of scope. Reports of
auth bypass, secret leakage to the browser, injection, or RCE are in scope and
very welcome.
