// Test-only helpers. Not imported by runtime handlers.
import type { Application, PendingUrl } from '@/types'
import type { DataAdapter, NewApplication, NewPendingUrl } from '@/storage/adapter'

let nextId = 1

function id(): string {
  nextId += 1
  return `id_${nextId}`
}

export function memoryAdapter(initial: { allowedEmails?: string[] } = {}): DataAdapter {
  const apps: Application[] = []
  const pendings: PendingUrl[] = []
  const allowedEmails = (initial.allowedEmails ?? []).slice()

  return {
    async listApplications() {
      return apps.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    },
    async getApplication(appId) {
      return apps.find(a => a.id === appId) ?? null
    },
    async createApplication(input: NewApplication) {
      const app: Application = { ...input, id: id(), createdAt: Date.now() }
      apps.push(app)
      return app
    },
    async updateApplication(appId, patch) {
      const i = apps.findIndex(a => a.id === appId)
      if (i === -1) return
      apps[i] = { ...apps[i], ...patch }
    },
    async deleteApplication(appId) {
      const i = apps.findIndex(a => a.id === appId)
      if (i !== -1) apps.splice(i, 1)
    },
    async listPendingUrls() {
      return pendings.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    },
    async createPendingUrls(inputs: NewPendingUrl[]) {
      const created = inputs.map(p => ({ ...p, id: id(), createdAt: Date.now() }))
      pendings.push(...created)
      return created
    },
    async updatePendingUrl(pendingId, patch) {
      const i = pendings.findIndex(p => p.id === pendingId)
      if (i === -1) return
      pendings[i] = { ...pendings[i], ...patch }
    },
    async deletePendingUrl(pendingId) {
      const i = pendings.findIndex(p => p.id === pendingId)
      if (i !== -1) pendings.splice(i, 1)
    },
    async approvePending(pendingId, application) {
      const i = pendings.findIndex(p => p.id === pendingId)
      if (i === -1) throw new Error(`pending_not_found:${pendingId}`)
      pendings.splice(i, 1)
      const app: Application = { ...application, id: id(), createdAt: Date.now() }
      apps.push(app)
      return app
    },
    async listAllowedEmails() {
      return allowedEmails.slice()
    },
  }
}

export function mockReq(opts: {
  method: string
  body?: unknown
  query?: Record<string, string>
}): import('@vercel/node').VercelRequest {
  return {
    method: opts.method,
    body: opts.body,
    query: opts.query ?? {},
    headers: {},
  } as unknown as import('@vercel/node').VercelRequest
}

export type CapturedRes = {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  ended: boolean
  res: import('@vercel/node').VercelResponse
}

export function mockRes(): CapturedRes {
  const captured: CapturedRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    ended: false,
    res: {} as import('@vercel/node').VercelResponse,
  }
  const res = {
    status(code: number) {
      captured.statusCode = code
      return res
    },
    json(b: unknown) {
      captured.body = b
      captured.ended = true
      return res
    },
    setHeader(k: string, v: string) {
      captured.headers[k] = v
      return res
    },
    end() {
      captured.ended = true
      return res
    },
  }
  captured.res = res as unknown as import('@vercel/node').VercelResponse
  return captured
}
