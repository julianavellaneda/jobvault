import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { NewApplication } from '@/storage/adapter'
import type { Application, WorkArrangement } from '@/types'
import { STATUSES, STATUS_LABELS } from '@/types'
import {
  EMPTY_MANUAL_FORM,
  buildNewApplication,
  canSubmitManualForm,
  type ManualAppForm,
} from '@/lib/newApplication'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Radix Select forbids empty-string item values, so represent the empty
// work-arrangement with a sentinel and map it back when building the payload.
const WORK_UNSET = 'unspecified'
const WORK_OPTIONS: { value: string; label: string }[] = [
  { value: WORK_UNSET, label: 'Unspecified' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  )
}

export function AddApplicationDialog({
  createApp,
  children,
}: {
  createApp: (input: NewApplication) => Promise<Application | null>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ManualAppForm>(EMPTY_MANUAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  const valid = canSubmitManualForm(form)

  function set<K extends keyof ManualAppForm>(key: K, value: ManualAppForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function reset() {
    setForm(EMPTY_MANUAL_FORM)
  }

  async function handleSubmit() {
    if (!valid || submitting) return
    setSubmitting(true)
    const created = await createApp(buildNewApplication(form))
    setSubmitting(false)
    if (created) {
      toast.success(`Added ${created.company || created.role || 'application'}`)
      reset()
      setOpen(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add application</DialogTitle>
          <DialogDescription>
            Enter the details by hand. It goes straight to your applications — no link required.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={e => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <Field label="Company">
            <Input
              autoFocus
              value={form.company}
              onChange={e => set('company', e.target.value)}
              placeholder="Acme Corp"
            />
          </Field>
          <Field label="Role">
            <Input
              value={form.role}
              onChange={e => set('role', e.target.value)}
              placeholder="Frontend Engineer"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="URL (optional)">
              <Input
                type="url"
                value={form.url}
                onChange={e => set('url', e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>

          <Field label="Salary">
            <Input
              value={form.salary}
              onChange={e => set('salary', e.target.value)}
              placeholder="$120k–$150k"
            />
          </Field>
          <Field label="Location">
            <Input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="New York, NY"
            />
          </Field>

          <Field label="Work arrangement">
            <Select
              value={form.workArrangement === '' ? WORK_UNSET : form.workArrangement}
              onValueChange={v =>
                set('workArrangement', (v === WORK_UNSET ? '' : v) as WorkArrangement)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={v => set('status', v as ManualAppForm['status'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Source">
            <Input
              value={form.source}
              onChange={e => set('source', e.target.value)}
              placeholder="LinkedIn, referral…"
            />
          </Field>
          <Field label="Deadline">
            <Input
              type="date"
              value={form.deadline}
              onChange={e => set('deadline', e.target.value)}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Tags (comma-separated)">
              <Input
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
                placeholder="remote, dream-job"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Anything worth remembering…"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? 'Adding…' : 'Add application'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
