# Jules Application Tracker

A tiny private web app for dumping job-application links, working through them, and tracking momentum (streaks, funnel, weekday heatmap, source/contributor breakdowns). One primary applicant + a few trusted collaborators who can also add links.

**Stack:** Vite + React 19 + React Compiler + TypeScript + Bun · Tailwind v4 · hand-rolled shadcn-style UI · Firebase (Auth + Firestore) · Vercel

> **Heads up — this repo is going OSS.** It's being prepared to ship publicly under **AGPL-3.0** as a self-hostable application tracker. The Firebase backend is being replaced with **Drizzle + libSQL** (local SQLite for self-host, Turso for the hosted version), auth is becoming optional, and AI features are moving to BYO-key. The setup instructions below describe the *current* Firebase-based state — they'll be replaced once the migration lands. Full plan in [`OSS_PLAN.md`](./OSS_PLAN.md).

## Setup

### 1. Firebase project

1. Create a Firebase project at https://console.firebase.google.com.
2. Enable **Firestore** (Production mode) and **Authentication → Google provider**.
3. In Project Settings → General → Your apps, register a Web app and copy the config.

### 2. Local env

Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.

### 3. Deploy security rules

```
bun add -g firebase-tools   # one-time
firebase login
firebase use --add          # pick your project
firebase deploy --only firestore:rules
```

### 4. Add allowlisted users

In Firebase Console → Firestore, create a collection named `allowlist` and add a document for each allowed Google email **using the email as the document ID**:

- `allowlist/javellaneda0213@gmail.com` → `{}` (empty doc is fine)
- `allowlist/your-collaborator@email.com` → `{}`

Anyone signing in with an email not in this list sees a "Not authorized" screen.

### 5. Run

```
bun install
bun dev
```

### 6. Deploy to Vercel

1. Push this repo to GitHub.
2. Import in Vercel — defaults work (Vite preset).
3. Add the same `VITE_FIREBASE_*` env vars in the Vercel project settings.
4. After first deploy, copy the Vercel domain into Firebase → Auth → Settings → Authorized domains.

## What's in here

- **Dashboard** — streak, applied today, total applied, pending backlog · 30-day activity chart · funnel (Applied → Interview → Offer) · burn-down · weekday heatmap · per-source bar chart · per-contributor list.
- **Applications** — search, filter chips for status/source/tags, **group by** (none/status/source/month-added) with collapsible sections, **sort by** (date added/applied/deadline/company) with asc/desc toggle (persisted to localStorage). Rows are compact one-liners by default and expand on click into the full inline-edit grid; status is signaled by a colored left border + badge. Status dropdown auto-stamps `appliedAt`.
- **Kanban** — five columns, drag-drop via `@dnd-kit/core`. Dropping into "Applied" stamps `appliedAt`.
- **Add Links** — paste any number of URLs (one per line), validates and bulk-creates pending applications.

All views read from a single live Firestore subscription so multiple devices stay in sync.
