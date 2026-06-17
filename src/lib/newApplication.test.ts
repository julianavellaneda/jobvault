import { describe, it, expect } from 'vitest'
import {
  EMPTY_MANUAL_FORM,
  buildNewApplication,
  canSubmitManualForm,
  type ManualAppForm,
} from './newApplication'

function form(overrides: Partial<ManualAppForm> = {}): ManualAppForm {
  return { ...EMPTY_MANUAL_FORM, ...overrides }
}

describe('canSubmitManualForm', () => {
  it('rejects an empty form', () => {
    expect(canSubmitManualForm(EMPTY_MANUAL_FORM)).toBe(false)
  })

  it('rejects whitespace-only company and role', () => {
    expect(canSubmitManualForm(form({ company: '   ', role: '\t' }))).toBe(false)
  })

  it('accepts a company alone', () => {
    expect(canSubmitManualForm(form({ company: 'Acme' }))).toBe(true)
  })

  it('accepts a role alone', () => {
    expect(canSubmitManualForm(form({ role: 'Engineer' }))).toBe(true)
  })
})

describe('buildNewApplication', () => {
  it('trims text fields and carries selects through', () => {
    const out = buildNewApplication(
      form({
        company: '  Acme Corp ',
        role: ' Frontend Engineer ',
        url: '  https://acme.com/jobs/1  ',
        salary: ' $120k ',
        location: ' NYC ',
        workArrangement: 'hybrid',
        source: ' Greenhouse ',
        status: 'interview',
        notes: '  call back  ',
      }),
    )
    expect(out.company).toBe('Acme Corp')
    expect(out.role).toBe('Frontend Engineer')
    expect(out.url).toBe('https://acme.com/jobs/1')
    expect(out.salary).toBe('$120k')
    expect(out.location).toBe('NYC')
    expect(out.workArrangement).toBe('hybrid')
    expect(out.source).toBe('Greenhouse')
    expect(out.status).toBe('interview')
    expect(out.notes).toBe('call back')
  })

  it('parses, trims, dedupes, and drops blank tags', () => {
    const out = buildNewApplication(form({ company: 'Acme', tags: 'remote, , urgent ,remote' }))
    expect(out.tags).toEqual(['remote', 'urgent'])
  })

  it('leaves url empty when not provided', () => {
    const out = buildNewApplication(form({ company: 'Acme' }))
    expect(out.url).toBe('')
  })

  it('maps an empty deadline to null', () => {
    expect(buildNewApplication(form({ company: 'Acme' })).deadline).toBeNull()
  })

  it('parses a YYYY-MM-DD deadline to a local-midnight timestamp', () => {
    const out = buildNewApplication(form({ company: 'Acme', deadline: '2026-06-20' }))
    expect(out.deadline).toBe(new Date(2026, 5, 20).getTime())
  })

  it('rejects a malformed deadline as null', () => {
    expect(buildNewApplication(form({ company: 'Acme', deadline: 'soon' })).deadline).toBeNull()
  })

  it('leaves server-stamped fields empty/null', () => {
    const out = buildNewApplication(form({ company: 'Acme', status: 'applied' }))
    expect(out.addedBy).toBe('')
    expect(out.addedByName).toBe('')
    expect(out.appliedAt).toBeNull()
    expect(out.followUpDate).toBeNull()
  })
})
