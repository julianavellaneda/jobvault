import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Loader2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { extractUrl } from '@/lib/extract'
import type { Application, ExtractedFields, PendingUrl, WorkArrangement } from '@/types'
import type { NewApplication } from '@/storage/adapter'
import { WORK_ARRANGEMENTS } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebouncedSaver, useReconciledDraft } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { confirm } from '@/lib/confirm'

type UpdatePendingFn = (id: string, patch: Partial<PendingUrl>) => Promise<void>
type RemovePendingFn = (id: string) => Promise<void>
type ApprovePendingFn = (id: string, app: NewApplication) => Promise<Application | null>
type AppsMutateFn = (updater: (prev: Application[]) => Application[]) => void

function ExtractionBadge({ p }: { p: PendingUrl }) {
  if (p.extraction === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
        <Loader2 className="size-3 animate-spin" /> Extracting…
      </span>
    )
  }
  if (p.extraction === 'error') {
    return (
      <span
        title={p.extractError}
        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-destructive)]/15 px-2 py-0.5 text-[11px] text-[var(--color-destructive)]"
      >
        <TriangleAlert className="size-3" /> Failed
      </span>
    )
  }
  if (p.extraction === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[11px] text-[var(--color-primary)]">
        <Check className="size-3" /> Extracted
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
      Queued
    </span>
  )
}

function ExtractedCell({
  remote,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  remote: string
  onChange: (value: string) => void
  onBlur: () => void
  placeholder?: string
  className?: string
}) {
  const draft = useReconciledDraft(remote)
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
        onChange(e.target.value)
      }}
    />
  )
}

function PendingRow({
  p,
  updatePending,
  removePending,
  approvePending,
  appsMutate,
}: {
  p: PendingUrl
  updatePending: UpdatePendingFn
  removePending: RemovePendingFn
  approvePending: ApprovePendingFn
  appsMutate: AppsMutateFn
}) {
  const [busy, setBusy] = useState<'approve' | 'reextract' | null>(null)
  const pendingPatchRef = useRef<Partial<ExtractedFields>>({})
  const latestExtractedRef = useRef<ExtractedFields>(p.extracted)
  useEffect(() => {
    latestExtractedRef.current = { ...p.extracted, ...pendingPatchRef.current }
  }, [p.extracted])

  const saver = useDebouncedSaver<Partial<ExtractedFields>>(async patch => {
    if (Object.keys(patch).length === 0) return
    pendingPatchRef.current = {}
    const next: ExtractedFields = { ...latestExtractedRef.current, ...patch }
    latestExtractedRef.current = next
    await updatePending(p.id, { extracted: next })
  })

  const queue = useCallback(
    <K extends keyof ExtractedFields>(field: K, value: ExtractedFields[K]) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, [field]: value }
      latestExtractedRef.current = { ...latestExtractedRef.current, [field]: value }
      saver.schedule(pendingPatchRef.current)
    },
    [saver],
  )

  const approve = useCallback(async () => {
    await saver.flush()
    const draft: ExtractedFields = latestExtractedRef.current
    pendingPatchRef.current = {}
    const payload: NewApplication = {
      url: p.url,
      company: draft.company ?? '',
      role: draft.role ?? '',
      salary: draft.salary ?? '',
      location: draft.location ?? '',
      workArrangement: draft.workArrangement ?? '',
      source: draft.source ?? '',
      tags: [],
      status: 'pending',
      notes: '',
      deadline: null,
      followUpDate: null,
      appliedAt: null,
      addedBy: p.addedBy,
      addedByName: p.addedByName,
    }
    const created = await approvePending(p.id, payload)
    if (created) {
      appsMutate(prev => [created, ...prev.filter(a => a.id !== created.id)])
      toast.success('Approved → moved to Applications')
    }
  }, [p, saver, approvePending, appsMutate])

  const reextract = useCallback(async () => {
    await saver.flush()
    await updatePending(p.id, { extraction: 'loading', extractError: '' })
    const result = await extractUrl(p.url)
    if (result.ok) {
      latestExtractedRef.current = result.extracted
      pendingPatchRef.current = {}
      await updatePending(p.id, {
        extraction: 'done',
        extracted: result.extracted,
        extractError: '',
      })
    } else {
      await updatePending(p.id, {
        extraction: 'error',
        extractError: result.error,
      })
      toast.error(`Extract failed: ${result.error}`)
    }
  }, [p.id, p.url, saver, updatePending])

  const handleReject = useCallback(async () => {
    if (!(await confirm('Reject and discard this link?', { destructive: true, confirmLabel: 'Reject' }))) return
    await saver.cancel()
    pendingPatchRef.current = {}
    await removePending(p.id)
    toast.success('Rejected')
  }, [p.id, saver, removePending])

  const hostLink = (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 truncate text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      title={p.url}
    >
      <span className="truncate">{p.hostname || p.url}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  )

  const workArrangementSelect = (
    <Select
      value={p.extracted.workArrangement || '__none__'}
      onValueChange={v => {
        const next = (v === '__none__' ? '' : v) as WorkArrangement
        queue('workArrangement', next)
        void saver.flush()
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

  const actionButtons = (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Re-extract"
        disabled={busy !== null || p.extraction === 'loading'}
        onClick={async () => {
          setBusy('reextract')
          await reextract()
          setBusy(null)
        }}
      >
        <RefreshCw className={cn('size-4', busy === 'reextract' && 'animate-spin')} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Approve"
        disabled={busy !== null}
        onClick={async () => {
          setBusy('approve')
          await approve()
          setBusy(null)
        }}
      >
        <Check className="size-4 text-[var(--color-primary)]" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Reject"
        disabled={busy !== null}
        onClick={() => void handleReject()}
      >
        <Trash2 className="size-4 text-[var(--color-destructive)]" />
      </Button>
    </>
  )

  const errorBlock =
    p.extraction === 'error' && p.extractError ? (
      <div className="text-[11px] text-[var(--color-destructive)]">{p.extractError}</div>
    ) : null

  return (
    <>
      {/* Mobile: stacked card */}
      <div className="flex flex-col gap-3 border-b border-[var(--color-border-soft)] px-4 py-4 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{hostLink}</div>
          <ExtractionBadge p={p} />
        </div>
        <ExtractedCell
          remote={p.extracted.company}
          placeholder="Company"
          onChange={v => queue('company', v)}
          onBlur={() => void saver.flush()}
        />
        <ExtractedCell
          remote={p.extracted.role}
          placeholder="Role"
          onChange={v => queue('role', v)}
          onBlur={() => void saver.flush()}
        />
        <div className="grid grid-cols-2 gap-2">
          <ExtractedCell
            remote={p.extracted.salary}
            placeholder="Salary"
            onChange={v => queue('salary', v)}
            onBlur={() => void saver.flush()}
          />
          <ExtractedCell
            remote={p.extracted.location}
            placeholder="Location"
            onChange={v => queue('location', v)}
            onBlur={() => void saver.flush()}
          />
          {workArrangementSelect}
          <ExtractedCell
            remote={p.extracted.source}
            placeholder="Source"
            onChange={v => queue('source', v)}
            onBlur={() => void saver.flush()}
          />
        </div>
        {errorBlock}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-faint)]">{p.addedByName}</span>
          <div className="flex gap-1">{actionButtons}</div>
        </div>
      </div>

      {/* Desktop: 12-col grid */}
      <div className="hidden grid-cols-12 gap-2 border-b border-[var(--color-border-soft)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]/50 md:grid">
        <div className="col-span-3 flex min-w-0 flex-col gap-1.5 justify-center">
          <div className="flex items-center gap-2">
            {hostLink}
            <ExtractionBadge p={p} />
          </div>
          {p.addedByName && (
            <span className="text-[10px] text-[var(--color-faint)]">
              {p.addedByName}
            </span>
          )}
          {errorBlock}
        </div>
        <div className="col-span-2 flex items-center">
          <ExtractedCell
            remote={p.extracted.company}
            placeholder="Company"
            onChange={v => queue('company', v)}
            onBlur={() => void saver.flush()}
            className="w-full"
          />
        </div>
        <div className="col-span-2 flex items-center">
          <ExtractedCell
            remote={p.extracted.role}
            placeholder="Role"
            onChange={v => queue('role', v)}
            onBlur={() => void saver.flush()}
            className="w-full"
          />
        </div>
        <div className="col-span-1 flex items-center">
          <ExtractedCell
            remote={p.extracted.salary}
            placeholder="$"
            onChange={v => queue('salary', v)}
            onBlur={() => void saver.flush()}
            className="w-full"
          />
        </div>
        <div className="col-span-1 flex items-center">
          <ExtractedCell
            remote={p.extracted.location}
            placeholder="Loc"
            onChange={v => queue('location', v)}
            onBlur={() => void saver.flush()}
            className="w-full"
          />
        </div>
        <div className="col-span-1 flex items-center">{workArrangementSelect}</div>
        <div className="col-span-1 flex items-center">
          <ExtractedCell
            remote={p.extracted.source}
            placeholder="Source"
            onChange={v => queue('source', v)}
            onBlur={() => void saver.flush()}
            className="w-full"
          />
        </div>
        <div className="col-span-1 flex items-center justify-end gap-1">{actionButtons}</div>
      </div>
    </>
  )
}

export function Pending({
  pending,
  loading,
  updatePending,
  removePending,
  approvePending,
  appsMutate,
}: {
  pending: PendingUrl[]
  loading: boolean
  updatePending: UpdatePendingFn
  removePending: RemovePendingFn
  approvePending: ApprovePendingFn
  appsMutate: AppsMutateFn
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Pending</h1>
          <span className="rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-sm tabular-nums text-[var(--color-muted-foreground)]">
            {pending.length}
          </span>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Review extracted details, then approve to add them to your applications.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/20">
                <Check className="size-5" />
              </div>
              <div className="text-sm text-[var(--color-muted-foreground)]">
                Nothing pending. Paste links in Add Links to queue them up.
              </div>
            </div>
          ) : (
            <div>
              {pending.map(p => (
                <PendingRow
                  key={p.id}
                  p={p}
                  updatePending={updatePending}
                  removePending={removePending}
                  approvePending={approvePending}
                  appsMutate={appsMutate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
