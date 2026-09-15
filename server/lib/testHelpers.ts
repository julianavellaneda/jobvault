import type { AiSettingsRow, Application, PendingUrl } from '@/types'
import type {
  DataAdapter,
  NewApplication,
  NewLocalUser,
  NewPendingUrl,
  NewSession,
  StoredLocalUser,
  StoredSession,
} from '@/storage/adapter'

let nextId = 1
function id(): string {
  nextId += 1
  return `id_${nextId}`
}

export function memoryAdapter(initial: { users?: StoredLocalUser[] } = {}): DataAdapter {
  const apps: Application[] = []
  const pendings: PendingUrl[] = []
  const users: StoredLocalUser[] = (initial.users ?? []).slice()
  let sessions: StoredSession[] = []
  let aiSettings: AiSettingsRow | null = null

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
    async countUsers() {
      return users.length
    },
    async findUserById(userId) {
      return users.find(u => u.id === userId) ?? null
    },
    async findUserByUsername(username) {
      const t = username.trim().toLowerCase()
      return users.find(u => u.username === t) ?? null
    },
    async createUser(input: NewLocalUser) {
      const username = input.username.trim().toLowerCase()
      if (users.some(u => u.username === username)) {
        throw new Error('user_username_taken')
      }
      const user: StoredLocalUser = {
        id: id(),
        username,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: Date.now(),
      }
      users.push(user)
      return user
    },
    async createInitialUser(input: NewLocalUser) {
      if (users.length > 0) {
        throw new Error('setup_already_complete')
      }
      const user: StoredLocalUser = {
        id: id(),
        username: input.username.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: Date.now(),
      }
      users.push(user)
      return user
    },
    async createSession(input: NewSession) {
      const session: StoredSession = { ...input, id: id(), createdAt: Date.now() }
      sessions.push(session)
      return session
    },
    async findSession(sessionId) {
      return sessions.find(s => s.id === sessionId) ?? null
    },
    async deleteSession(sessionId) {
      sessions = sessions.filter(s => s.id !== sessionId)
    },
    async deleteExpiredSessions(now) {
      sessions = sessions.filter(s => s.expiresAt > now)
    },
    async getAiSettings() {
      return aiSettings ? { ...aiSettings } : null
    },
    async setAiSettings(patch) {
      const base: AiSettingsRow = aiSettings ?? {
        provider: 'minimax',
        apiKey: '',
        model: '',
        baseUrl: '',
        updatedAt: 0,
      }
      aiSettings = { ...base, ...patch, updatedAt: Date.now() }
    },
  }
}
