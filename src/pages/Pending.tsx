import { useRef, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { Check, ExternalLink, Loader2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from 'firebase/auth'
import { db } from '@/firebase'
import { extractUrl } from '@/lib/extract'
import type { ExtractedFields, PendingUrl, WorkArrangement } from '@/types'
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
import { cn } from '@/lib/utils'

function useDebouncedExtractedUpdate(id: string, field: keyof ExtractedFields) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (value: string) => {
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => {
      void updateDoc(doc(db, 'pendingUrls', id), { [`extracted.${field}`]: value }).catch(e => {
        toast.error(e instanceof Error ? e.message : 'Save failed')
      })
    }, 500)
  }
}

function ExtractedCell({
  initial,
  field,
  id,
  placeholder,
}: {
  initial: string
  field: keyof ExtractedFields
  id: string
  placeholder?: string
}) {
  const [value, setValue] = useState(initial)
  const save = useDebouncedExtractedUpdate(id, field)
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={e => {
        setValue(e.target.value)
        save(e.target.value)
      }}
    />
  )
}

function StatusPill({ p }: { p: PendingUrl }) {
  if (p.extraction === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px]">
        <Loader2 className="size-3 animate-spin" /> extracting
      </span>
    )
  }
  if (p.extraction === 'error') {
    return (
      <span
        title={p.extractError}
        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-destructive)]/15 px-2 py-0.5 text-[11px] text-[var(--color-destructive)]"
      >
        <TriangleAlert className="size-3" /> failed
      </span>
    )
  }
  if (p.extraction === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[11px]">
        <Check className="size-3" /> ready
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
      queued
    </span>
  )
}

async function reextract(id: string, url: string) {
  const ref = doc(db, 'pendingUrls', id)
  await updateDoc(ref, { extraction: 'loading', extractError: '' }).catch(() => {})
  const result = await extractUrl(url)
  if (result.ok) {
    await updateDoc(ref, {
      extraction: 'done',
      extracted: result.extracted,
      extractError: '',
    }).catch(e => toast.error(e instanceof Error ? e.message : 'Save failed'))
  } else {
    await updateDoc(ref, {
      extraction: 'error',
      extractError: result.error,
    }).catch(() => {})
    toast.error(`Extract failed: ${result.error}`)
  }
}

async function approve(p: PendingUrl, user: User) {
  const batch = writeBatch(db)
  const newRef = doc(collection(db, 'applications'))
  batch.set(newRef, {
    url: p.url,
    company: p.extracted.company ?? '',
    role: p.extracted.role ?? '',
    salary: p.extracted.salary ?? '',
    location: p.extracted.location ?? '',
    workArrangement: p.extracted.workArrangement ?? '',
    source: p.extracted.source ?? '',
    tags: [],
    status: 'pending',
    notes: '',
    deadline: null,
    followUpDate: null,
    appliedAt: null,
    createdAt: serverTimestamp(),
    addedBy: p.addedBy || user.uid,
    addedByName: p.addedByName || (user.displayName ?? user.email ?? 'Unknown'),
  })
  batch.delete(doc(db, 'pendingUrls', p.id))
  try {
    await batch.commit()
    toast.success('Approved → moved to Applications')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Approve failed')
  }
}

async function reject(id: string) {
  if (!confirm('Reject and discard this link?')) return
  try {
    await deleteDoc(doc(db, 'pendingUrls', id))
    toast.success('Rejected')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Reject failed')
  }
}

function PendingRow({ p, user }: { p: PendingUrl; user: User }) {
  const [busy, setBusy] = useState<'approve' | 'reextract' | null>(null)
  return (
    <div className="grid grid-cols-12 gap-2 border-b px-3 py-3 hover:bg-[var(--color-accent)]/40">
      <div className="col-span-12 flex items-center gap-2 md:col-span-3">
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
        <StatusPill p={p} />
      </div>
      <div className="col-span-6 md:col-span-2">
        <ExtractedCell key={`c-${p.id}`} id={p.id} field="company" initial={p.extracted.company} placeholder="Company" />
      </div>
      <div className="col-span-6 md:col-span-2">
        <ExtractedCell key={`r-${p.id}`} id={p.id} field="role" initial={p.extracted.role} placeholder="Role" />
      </div>
      <div className="col-span-6 md:col-span-1">
        <ExtractedCell key={`s-${p.id}`} id={p.id} field="salary" initial={p.extracted.salary} placeholder="$" />
      </div>
      <div className="col-span-6 md:col-span-1">
        <ExtractedCell key={`l-${p.id}`} id={p.id} field="location" initial={p.extracted.location} placeholder="Loc" />
      </div>
      <div className="col-span-6 md:col-span-1">
        <Select
          value={p.extracted.workArrangement || '__none__'}
          onValueChange={v => {
            const next = (v === '__none__' ? '' : v) as WorkArrangement
            void updateDoc(doc(db, 'pendingUrls', p.id), { 'extracted.workArrangement': next })
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
      </div>
      <div className="col-span-6 md:col-span-1">
        <ExtractedCell key={`src-${p.id}`} id={p.id} field="source" initial={p.extracted.source} placeholder="Source" />
      </div>
      <div className="col-span-12 flex items-center justify-end gap-1 md:col-span-1">
        <Button
          variant="ghost"
          size="icon"
          title="Re-extract"
          disabled={busy !== null || p.extraction === 'loading'}
          onClick={async () => {
            setBusy('reextract')
            await reextract(p.id, p.url)
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
            await approve(p, user)
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
          onClick={() => void reject(p.id)}
        >
          <Trash2 className="size-4 text-[var(--color-destructive)]" />
        </Button>
      </div>
      {p.extraction === 'error' && p.extractError ? (
        <div className="col-span-12 text-[11px] text-[var(--color-destructive)]">
          {p.extractError}
        </div>
      ) : null}
    </div>
  )
}

export function Pending({
  user,
  pending,
  loading,
}: {
  user: User
  pending: PendingUrl[]
  loading: boolean
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pending</h1>
        <span className="text-sm text-[var(--color-muted-foreground)]">
          {pending.length} awaiting review
        </span>
      </div>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Auto-extracted from each URL. Approve to move into Applications, or reject to discard.
      </p>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : pending.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-muted-foreground)]">
              Nothing pending. Paste links in Add Links to queue them up.
            </div>
          ) : (
            <div className="divide-y">
              {pending.map(p => (
                <PendingRow key={p.id} p={p} user={user} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
