import { useState } from 'react'
import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { toast } from 'sonner'
import type { User } from 'firebase/auth'
import { db } from '@/firebase'
import { hostnameOf, parseUrlsFromPaste } from '@/lib/urls'
import { extractUrl } from '@/lib/extract'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const EMPTY_EXTRACTED = {
  company: '',
  role: '',
  salary: '',
  location: '',
  workArrangement: '',
  source: '',
}

const EXTRACT_CONCURRENCY = 4

async function runExtractions(jobs: { id: string; url: string }[]) {
  let i = 0
  const workers = Array.from({ length: Math.min(EXTRACT_CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      const ref = doc(db, 'pendingUrls', job.id)
      await updateDoc(ref, { extraction: 'loading' }).catch(() => {})
      const result = await extractUrl(job.url)
      if (result.ok) {
        await updateDoc(ref, {
          extraction: 'done',
          extracted: result.extracted,
          extractError: '',
        }).catch(() => {})
      } else {
        await updateDoc(ref, {
          extraction: 'error',
          extractError: result.error,
        }).catch(() => {})
      }
    }
  })
  await Promise.all(workers)
}

export function AddLinks({ user }: { user: User }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const preview = parseUrlsFromPaste(text)

  async function handleSubmit() {
    if (preview.valid.length === 0) return
    setSubmitting(true)
    try {
      const jobs: { id: string; url: string }[] = []
      const chunks: string[][] = []
      for (let i = 0; i < preview.valid.length; i += 400) {
        chunks.push(preview.valid.slice(i, i + 400))
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const url of chunk) {
          const ref = doc(collection(db, 'pendingUrls'))
          jobs.push({ id: ref.id, url })
          batch.set(ref, {
            url,
            hostname: hostnameOf(url),
            extraction: 'idle',
            extracted: EMPTY_EXTRACTED,
            extractError: '',
            createdAt: serverTimestamp(),
            addedBy: user.uid,
            addedByName: user.displayName ?? user.email ?? 'Unknown',
          })
        }
        await batch.commit()
      }
      toast.success(
        `Added ${jobs.length} to Pending — extracting…` +
          (preview.invalid.length ? ` · ${preview.invalid.length} skipped` : ''),
      )
      setText('')
      void runExtractions(jobs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add links')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add Links</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Paste one URL per line. Each one lands in <span className="font-medium">Pending</span> for review — we'll auto-extract company, role, salary, etc.
        </p>
      </div>
      <Card>
        <CardContent className="p-4">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'https://example.com/job/123\nhttps://linkedin.com/jobs/view/456'}
            className="min-h-[260px] font-mono text-sm"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {preview.valid.length} valid
              {preview.invalid.length ? ` · ${preview.invalid.length} invalid` : ''}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || preview.valid.length === 0}
            >
              {submitting ? 'Adding…' : `Add ${preview.valid.length || ''}`.trim()}
            </Button>
          </div>
        </CardContent>
      </Card>
      {preview.invalid.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Skipped (not valid URLs)</CardTitle>
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
