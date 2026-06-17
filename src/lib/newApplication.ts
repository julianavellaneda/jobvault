import type { NewApplication } from '@/storage/adapter'
import type { Status, WorkArrangement } from '@/types'

/** Raw form state for the manual-add dialog (all values are strings as typed). */
export interface ManualAppForm {
  company: string
  role: string
  url: string
  salary: string
  location: string
  workArrangement: WorkArrangement
  source: string
  status: Status
  /** Comma-separated, as typed. */
  tags: string
  /** `YYYY-MM-DD` from a native date input, or '' for none. */
  deadline: string
  notes: string
}

export const EMPTY_MANUAL_FORM: ManualAppForm = {
  company: '',
  role: '',
  url: '',
  salary: '',
  location: '',
  workArrangement: '',
  source: '',
  status: 'pending',
  tags: '',
  deadline: '',
  notes: '',
}

/** A manual entry is meaningful only with a company or a role. */
export function canSubmitManualForm(form: ManualAppForm): boolean {
  return form.company.trim().length > 0 || form.role.trim().length > 0
}

/** Split comma-separated tags, trim, drop blanks, dedupe (order-preserving). */
function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(',')) {
    const tag = part.trim()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** Parse a `YYYY-MM-DD` date input to local-midnight ms, or null when empty/invalid. */
function parseDeadline(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Build a `NewApplication` from raw manual-form state. Server stamps
 * `addedBy`/`addedByName` and auto-stamps `appliedAt` when status is `applied`.
 */
export function buildNewApplication(form: ManualAppForm): NewApplication {
  return {
    url: form.url.trim(),
    company: form.company.trim(),
    role: form.role.trim(),
    salary: form.salary.trim(),
    location: form.location.trim(),
    workArrangement: form.workArrangement,
    source: form.source.trim(),
    tags: parseTags(form.tags),
    status: form.status,
    notes: form.notes.trim(),
    deadline: parseDeadline(form.deadline),
    followUpDate: null,
    appliedAt: null,
    addedBy: '',
    addedByName: '',
  }
}
