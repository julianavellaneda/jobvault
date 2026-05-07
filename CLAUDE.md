# Jules Application Tracker

Private web app for Jules to dump job-application links and track applying momentum. One primary applicant (Jules) + a few trusted collaborators (girlfriend / family) who can also add links and view stats. Trust-based: anyone in the Firestore allowlist can edit anything.

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
- **Pages** in `src/pages/`: `Dashboard`, `Applications` (search + chip filters + inline-editable rows), `Kanban` (dnd-kit), `AddLinks` (bulk paste).
- **Theme**: dark mode toggled by adding `.dark` to `<html>`, persisted to localStorage. CSS vars in `src/index.css` define both light + dark palettes.

## Conventions

- `verbatimModuleSyntax` is on — every type-only import must be `import type { ... }`. The build (`tsc -b`) will fail otherwise.
- Status changes that move to `applied` should auto-stamp `appliedAt: serverTimestamp()` if it's not already set. Both `ApplicationRow.tsx` and `Kanban.tsx` enforce this — keep the rule centralized in your head when touching either.
- Inline edits use a 500ms debounced `updateDoc`. New editable fields should follow the `EditableCell` pattern in `ApplicationRow.tsx` (don't sync prop → state in a `useEffect`; rely on `key={app.id}` for row remount).
- Bulk Firestore writes use `writeBatch` chunked at 400 ops (Firestore limit is 500).
- Toasts via `sonner` — `toast.success` / `toast.error` for any user-visible write outcome.
- ESLint config has `react-refresh/only-export-components` disabled for `src/components/ui/**` (shadcn-style files always export both components and helpers).

## Firebase setup (also in README)

- Env vars: `VITE_FIREBASE_*` in `.env.local` (template in `.env.example`)
- Rules: `firestore.rules` deployed via `firebase deploy --only firestore:rules`
- Allowlist: manually create `allowlist/{email}` docs in Firebase console (one per allowed Google account, empty body is fine)
- After Vercel deploy, add the Vercel domain under Firebase Auth → Authorized domains

## Don'ts

- Don't add a router lib — hash routing is intentional, this is a 4-tab app
- Don't store precomputed stats in Firestore — recompute client-side from the live snapshot
- Don't run the dev server in agent commands without a real `.env.local` — Firebase init will throw
- Don't use enums, namespaces, or `import` (without `type`) for type-only symbols (TS6 will reject)
- Don't introduce per-user lists / sharing rules — explicit decision: single shared pool, trust-based edits

## Verify before reporting done

```
bun run lint && bun run build
```

Both must pass with no errors.
