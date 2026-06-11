import { useState } from 'react'
import { Check, Link, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { parseUrlsFromPaste } from '@/lib/urls'
import { extractUrl } from '@/lib/extract'
import type { NewPendingUrl } from '@/storage/adapter'
import type { ExtractedFields, PendingUrl } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const EMPTY_EXTRACTED: ExtractedFields = {
  company: '',
  role: '',
  salary: '',
  location: '',
  workArrangement: '',
  source: '',
}

const EXTRACT_CONCURRENCY = 4

type UpdatePendingFn = (id: string, patch: Partial<PendingUrl>) => Promise<void>

async function runExtractions(
  jobs: { id: string; url: string }[],
  updatePending: UpdatePendingFn,
) {
  let i = 0
  const workers = Array.from({ length: Math.min(EXTRACT_CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      await updatePending(job.id, { extraction: 'loading' }).catch(() => {})
      const result = await extractUrl(job.url)
      if (result.ok) {
        await updatePending(job.id, {
          extraction: 'done',
          extracted: result.extracted,
          extractError: '',
        }).catch(() => {})
      } else {
        await updatePending(job.id, {
          extraction: 'error',
          extractError: result.error,
        }).catch(() => {})
      }
    }
  })
  await Promise.all(workers)
}

export function AddLinks({
  createPending,
  updatePending,
}: {
  createPending: (inputs: NewPendingUrl[]) => Promise<PendingUrl[]>
  updatePending: UpdatePendingFn
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const preview = parseUrlsFromPaste(text)

  async function handleSubmit() {
    if (preview.valid.length === 0) return
    setSubmitting(true)
    try {
      const inputs: NewPendingUrl[] = preview.valid.map(url => ({
        url,
        hostname: '',
        extraction: 'idle',
        extracted: { ...EMPTY_EXTRACTED },
        extractError: '',
        addedBy: '',
        addedByName: '',
      }))
      const created = await createPending(inputs)
      if (created.length > 0) {
        toast.success(
          `Added ${created.length} to Pending — extracting…` +
            (preview.invalid.length ? ` · ${preview.invalid.length} skipped` : ''),
        )
        setText('')
        void runExtractions(
          created.map(c => ({ id: c.id, url: c.url })),
          updatePending,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add links')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add Links</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Paste job posting URLs — one per line. We'll fetch and extract the details for you.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Job URLs
            </span>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'https://jobs.ashbyhq.com/acme/frontend-engineer\nhttps://boards.greenhouse.io/company/jobs/123\nhttps://…'}
              className="min-h-[220px] font-mono text-sm"
            />
          </label>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {preview.valid.length > 0 ? (
                <>
                  <span className="font-semibold tabular-nums text-[var(--color-foreground)]">
                    {preview.valid.length}
                  </span>{' '}
                  valid {preview.valid.length === 1 ? 'link' : 'links'} detected
                  {preview.invalid.length ? (
                    <span className="text-[var(--color-faint)]">
                      {' '}· {preview.invalid.length} invalid
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-[var(--color-faint)]">No links yet</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setText('')}
                disabled={text.length === 0}
              >
                Clear
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || preview.valid.length === 0}
                size="sm"
              >
                <Sparkles className="size-4" />
                {submitting ? 'Adding…' : `Extract ${preview.valid.length || ''}`.trim()}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hint cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/50 p-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Link className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Paste in bulk</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              Drop a whole list — duplicates are skipped automatically.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/50 p-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Auto-extraction</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              Company, role, salary and location are pulled from the page.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/50 p-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Check className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Review then approve</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              Check extracted fields in Pending before they join your list.
            </p>
          </div>
        </div>
      </div>

      {preview.invalid.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Skipped (not valid URLs)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {preview.invalid.slice(0, 20).map((line, i) => (
                <li key={i} className="font-mono text-[var(--color-muted-foreground)]">{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
