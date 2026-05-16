# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/Mclovin0213/jules-application-tracker/security/advisories/new)
(Security → Report a vulnerability). I aim to acknowledge reports within 72 hours
and to ship a fix or mitigation for confirmed issues as quickly as is practical
for a solo-maintained project.

When reporting, please include reproduction steps, the affected version/commit,
and the impact you observed.

## Supported versions

Only the latest released version (`v0.x` line) receives security fixes. This is
an early-stage project; pin to a tag and watch releases.

## Trust model — read this before exposing an instance

Jules is a **single shared pool, trust-based** app. There are no per-user data
boundaries: anyone who can authenticate (or anyone at all, in `AUTH_MODE=none`)
can read and edit every record. This is an intentional design decision for the
"me / my small group" use case, not a bug.

Specific things operators should know:

- **`AUTH_MODE=none` is fail-closed in production.** With `NODE_ENV=production`,
  the server refuses every request unless `ALLOW_NO_AUTH=true` is explicitly set.
  Only set it if the instance is on a trusted network / behind your own
  reverse-proxy auth or VPN.
- **AI provider API keys are stored in plaintext** in the SQLite database
  (`data/app.db`). The trust boundary is the filesystem: protect that file with
  OS permissions and don't commit it. Keys are never returned to the browser —
  the Settings page only shows a masked `••••last4` preview.
- **TLS is not handled by the app.** Bun serves plain HTTP; terminate TLS at an
  upstream reverse proxy (Caddy / nginx / Cloudflare). See `docs/SELF_HOSTING.md`.
- **Sessions** are sealed cookies (iron-session). `SESSION_SECRET` must be ≥ 32
  chars and kept secret; rotating it invalidates all sessions.

Reports that amount to "the trust model is permissive by design" (e.g. one
allowlisted user can edit another's rows) are known and out of scope. Reports of
auth bypass, secret leakage to the browser, injection, or RCE are in scope and
very welcome.
