import { useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Application, Status, WorkArrangement } from '@/types'
import { STATUSES, WORK_ARRANGEMENTS, STATUS_LABELS } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Monogram } from '@/components/ui/Monogram'
import { StatusPill } from '@/components/ui/StatusPill'
import { hostnameOf } from '@/lib/urls'
import { useDebouncedSaver, useReconciledDraft } from '@/lib/hooks'
import { formatShortDate } from '@/lib/applicationsView'
import { STATUS_BORDER } from '@/lib/statusColors'
import { confirm } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Shared grid template used by both the desktop CompactRow and the Applications list-head.
// columns: chevron | monogram | company/role | salary | location | tags | status | added | ext-link
export const ROW_GRID =
  'grid grid-cols-[16px_30px_minmax(0,1fr)_90px_120px_minmax(0,140px)_120px_90px_24px] items-center gap-3'

type FieldUpdate = Partial<Pick<Application, 'company' | 'role' | 'salary' | 'location' | 'source' | 'notes' | 'tags'>>

type UpdateFn = (id: string, patch: Partial<Application>) => Promise<void>
type RemoveFn = (id: string) => Promise<void>

function useRowSaver(id: string, onUpdate: UpdateFn) {
  const pendingRef = useRef<FieldUpdate>({})
  const saver = useDebouncedSaver<FieldUpdate>(async update => {
    if (Object.keys(update).length === 0) return
    pendingRef.current = {}
    await onUpdate(id, update)
  })
  const queue = useCallback(
    (patch: FieldUpdate) => {
      pendingRef.current = { ...pendingRef.current, ...patch }
      saver.schedule(pendingRef.current)
    },
    [saver],
  )
  return { queue, flush: saver.flush, cancel: saver.cancel }
}

function EditableCell({
  initial,
  field,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  initial: string
  field: keyof Application
  onChange: (patch: FieldUpdate) => void
  onBlur: () => void
  placeholder?: string
  className?: string
}) {
  const draft = useReconciledDraft(initial)
  return (
    <Input
      value={draft.value}
      placeholder={placeholder}
      className={className}
      onFocus={draft.onFocus}
      onBlur={() => {
        draft.onBlur()
        onBlur()
      }}
      onChange={e => {
        draft.setValue(e.target.value)
        onChange({ [field]: e.target.value } as FieldUpdate)
      }}
    />
  )
}

function TagsCell({
  tags,
  onChange,
  onBlur,
}: {
  tags: string[]
  onChange: (patch: FieldUpdate) => void
  onBlur: () => void
}) {
  const draft = useReconciledDraft(tags.join(', '))
  return (
    <Input
      value={draft.value}
      placeholder="frontend, dream-job"
      onFocus={draft.onFocus}
      onBlur={() => {
        draft.onBlur()
        onBlur()
      }}
      onChange={e => {
        draft.setValue(e.target.value)
        const parsed = e.target.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        onChange({ tags: parsed })
      }}
    />
  )
}

function CompactRow({
  app,
  onToggle,
}: {
  app: Application
  onToggle: () => void
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }
  return (
    <>
      {/* Mobile: stacked compact */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left hover:bg-[var(--color-accent)]/40 md:hidden"
      >
        <ChevronRight className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <Monogram name={app.company} sm />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{app.company || 'Untitled'}</div>
          {app.role ? (
            <div className="truncate text-xs text-[var(--color-muted-foreground)]">{app.role}</div>
          ) : null}
        </div>
        <StatusPill status={app.status} />
      </div>

      {/* Desktop: single-line grid aligned with list-head */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          ROW_GRID,
          'hidden w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[var(--color-accent)]/40 md:grid',
        )}
      >
        {/* chevron */}
        <ChevronRight className="size-4 text-[var(--color-muted-foreground)]" />
        {/* monogram */}
        <Monogram name={app.company} sm />
        {/* company / role */}
        <div className="min-w-0">
          <div className="truncate font-medium">{app.company || 'Untitled'}</div>
          {app.role ? (
            <div className="truncate text-xs text-[var(--color-muted-foreground)]">{app.role}</div>
          ) : null}
        </div>
        {/* salary */}
        <span className="tabular-nums truncate text-xs text-[var(--color-muted-foreground)]">
          {app.salary || '—'}
        </span>
        {/* location */}
        <span className="truncate text-xs text-[var(--color-muted-foreground)]">
          {app.location || '—'}
        </span>
        {/* tags (up to 2) */}
        <div className="flex flex-wrap gap-1 min-w-0">
          {app.tags.slice(0, 2).map(t => (
            <span
              key={t}
              className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)] truncate"
            >
              {t}
            </span>
          ))}
        </div>
        {/* status */}
        <StatusPill status={app.status} />
        {/* added date */}
        <span className="tabular-nums text-xs text-[var(--color-muted-foreground)]">
          {formatShortDate(app.createdAt)}
        </span>
        {/* external link */}
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          title={app.url}
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </>
  )
}

function ExpandedRow({
  app,
  onCollapse,
  onUpdate,
  onRemove,
}: {
  app: Application
  onCollapse: () => void
  onUpdate: UpdateFn
  onRemove: RemoveFn
}) {
  const row = useRowSaver(app.id, onUpdate)

  const handleDelete = useCallback(async () => {
    if (!(await confirm('Delete this application?', { destructive: true, confirmLabel: 'Delete' }))) return
    await row.cancel()
    try {
      await onRemove(app.id)
      toast.success('Deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }, [app.id, row, onRemove])

  const collapseButton = (
    <button
      type="button"
      onClick={onCollapse}
      className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--color-accent)]"
      title="Collapse"
    >
      <ChevronDown className="size-4 text-[var(--color-muted-foreground)]" />
    </button>
  )

  const hostLink = (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      title={app.url}
    >
      {hostnameOf(app.url)}
      <ExternalLink className="size-3" />
    </a>
  )

  const statusSelect = (
    <Select value={app.status} onValueChange={v => void onUpdate(app.id, { status: v as Status })}>
      <SelectTrigger className="h-9">
        <SelectValue>
          <StatusPill status={app.status} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map(s => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const workArrangementSelect = (
    <Select
      value={app.workArrangement || '__none__'}
      onValueChange={v => {
        const next = (v === '__none__' ? '' : v) as WorkArrangement
        void onUpdate(app.id, { workArrangement: next })
      }}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {WORK_ARRANGEMENTS.filter(Boolean).map(wa => (
          <SelectItem key={wa} value={wa}>
            {wa}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const deleteButton = (
    <Button variant="ghost" size="icon" onClick={() => void handleDelete()} title="Delete">
      <Trash2 className="size-4 text-[var(--color-destructive)]" />
    </Button>
  )

  return (
    <>
      {/* Mobile: stacked card */}
      <div className="flex flex-col gap-2 px-3 py-3 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {collapseButton}
            <Monogram name={app.company} sm />
            {hostLink}
          </div>
          <div className="w-32 shrink-0">{statusSelect}</div>
        </div>
        <EditableCell
          field="company"
          initial={app.company}
          placeholder="Company"
          onChange={row.queue}
          onBlur={() => void row.flush()}
        />
        <EditableCell
          field="role"
          initial={app.role}
          placeholder="Role"
          onChange={row.queue}
          onBlur={() => void row.flush()}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditableCell
            field="salary"
            initial={app.salary}
            placeholder="Salary"
            onChange={row.queue}
            onBlur={() => void row.flush()}
          />
          <EditableCell
            field="location"
            initial={app.location}
            placeholder="Location"
            onChange={row.queue}
            onBlur={() => void row.flush()}
          />
          {workArrangementSelect}
          <EditableCell
            field="source"
            initial={app.source}
            placeholder="Source"
            onChange={row.queue}
            onBlur={() => void row.flush()}
          />
        </div>
        <TagsCell tags={app.tags} onChange={row.queue} onBlur={() => void row.flush()} />
        <EditableCell
          field="notes"
          initial={app.notes}
          placeholder="Notes"
          onChange={row.queue}
          onBlur={() => void row.flush()}
        />
        <div className="flex justify-between items-center gap-2">
          <span className="text-[11px] text-[var(--color-faint)]">
            Added by {app.addedByName} · {formatShortDate(app.createdAt)}
          </span>
          {deleteButton}
        </div>
      </div>

      {/* Desktop: rich expanded layout */}
      <div className="hidden flex-col gap-3 px-3 py-3 md:flex">
        {/* Head row: collapse · monogram · company/role stacked · host link · status */}
        <div className="flex items-center gap-3">
          {collapseButton}
          <Monogram name={app.company} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <label>
              <span className="sr-only">Company</span>
              <EditableCell
                field="company"
                initial={app.company}
                placeholder="Company"
                onChange={row.queue}
                onBlur={() => void row.flush()}
                className="h-7 text-sm font-semibold"
              />
            </label>
            <label>
              <span className="sr-only">Role</span>
              <EditableCell
                field="role"
                initial={app.role}
                placeholder="Role"
                onChange={row.queue}
                onBlur={() => void row.flush()}
                className="h-6 text-xs text-[var(--color-muted-foreground)]"
              />
            </label>
          </div>
          {hostLink}
          <div className="w-32 shrink-0">{statusSelect}</div>
        </div>

        {/* Field grid: 3-col for labeled fields */}
        <div className="grid grid-cols-3 gap-3 pl-9">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Salary
            </span>
            <EditableCell
              field="salary"
              initial={app.salary}
              placeholder="—"
              onChange={row.queue}
              onBlur={() => void row.flush()}
              className="tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Location
            </span>
            <EditableCell
              field="location"
              initial={app.location}
              placeholder="—"
              onChange={row.queue}
              onBlur={() => void row.flush()}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Arrangement
            </span>
            {workArrangementSelect}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Source
            </span>
            <EditableCell
              field="source"
              initial={app.source}
              placeholder="—"
              onChange={row.queue}
              onBlur={() => void row.flush()}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Applied
            </span>
            <span className="flex h-9 items-center px-3 text-sm tabular-nums text-[var(--color-muted-foreground)]">
              {formatShortDate(app.appliedAt) || '—'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Deadline
            </span>
            <span className="flex h-9 items-center px-3 text-sm tabular-nums text-[var(--color-muted-foreground)]">
              {formatShortDate(app.deadline) || '—'}
            </span>
          </div>
        </div>

        {/* Wide row: tags + notes */}
        <div className="grid grid-cols-2 gap-3 pl-9">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Tags
            </span>
            <TagsCell tags={app.tags} onChange={row.queue} onBlur={() => void row.flush()} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Notes
            </span>
            <EditableCell
              field="notes"
              initial={app.notes}
              placeholder="Add a note…"
              onChange={row.queue}
              onBlur={() => void row.flush()}
            />
          </label>
        </div>

        {/* Footer: meta + delete */}
        <div className="flex items-center justify-between pl-9">
          <span className="text-[11px] text-[var(--color-faint)]">
            Added by {app.addedByName} · {formatShortDate(app.createdAt)}
          </span>
          {deleteButton}
        </div>
      </div>
    </>
  )
}

export function ApplicationRow({
  app,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  app: Application
  expanded: boolean
  onToggle: () => void
  onUpdate: UpdateFn
  onRemove: RemoveFn
}) {
  return (
    <div className={cn('border-l-4', STATUS_BORDER[app.status])}>
      {expanded ? (
        <ExpandedRow app={app} onCollapse={onToggle} onUpdate={onUpdate} onRemove={onRemove} />
      ) : (
        <CompactRow app={app} onToggle={onToggle} />
      )}
    </div>
  )
}
