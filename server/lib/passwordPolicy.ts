// Minimum password length policy.
//
// There is no length requirement by default — a non-empty password is the
// only rule. Operators who want a stronger policy can opt in by setting the
// `MIN_PASSWORD_LENGTH` env var. Read at call time so tests can vary the env.

export const MAX_PASSWORD_LENGTH = 200

export function getMinPasswordLength(): number {
  const raw = process.env.MIN_PASSWORD_LENGTH?.trim()
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, MAX_PASSWORD_LENGTH)
}
