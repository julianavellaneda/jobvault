# Contributing

Thanks for considering a contribution. This is a small, opinionated project —
reading the [non-goals](README.md#non-goals) first will save everyone time:
**no auto-apply, scraping, mass submission, hosted SaaS, or payment infra.** PRs
in those directions will be declined regardless of quality.

## Project conventions

The full architecture and conventions live in [`CLAUDE.md`](CLAUDE.md). The
short version:

- **Bun, not npm.** `bun install`, `bun run dev`, `bun run test`, etc.
- **TypeScript 6** with `verbatimModuleSyntax` + `erasableSyntaxOnly`: every
  type-only import must be `import type { … }`. No enums, no namespaces, no
  parameter properties — `tsc -b` will reject them.
- Hash routing is intentional — don't add a router lib.
- All browser mutations go through the REST hooks; never write to storage from
  the client.
- Status → color lives in `src/lib/statusColors.ts`; chart colors come from CSS
  variables, not hard-coded `oklch()`.

## Dev setup

```
bun install
bun run dev          # vite :5173 + bun --watch server :3000
```

No config is needed for solo dev — the default `AUTH_MODE=none` gives you a
synthetic local user and `data/app.db` is created on first boot. Copy
`.env.example` to `.env.local` only if you want to exercise OAuth or AI extract.

## Before you open a PR

Branch off `main`, PR back to `main`. All three of these must pass with **no
errors** — CI runs the same:

```
bun run lint && bun run test && bun run build
```

Add or update tests for behavior changes. Test layout is documented in
`CLAUDE.md` (Hono handler tests, the better-sqlite3 adapter tests, pure-function
UI logic). Keep PRs focused — one concern per PR.

## Reporting bugs / proposing features

Use the issue templates. For anything security-related, see
[`SECURITY.md`](SECURITY.md) — do **not** file a public issue.

By contributing you agree your contributions are licensed under the project's
[AGPL-3.0](LICENSE).
