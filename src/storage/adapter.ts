import type { AiSettingsRow, Application, PendingUrl } from '@/types'

export type NewApplication = Omit<Application, 'id' | 'createdAt'>
export type NewPendingUrl = Omit<PendingUrl, 'id' | 'createdAt'>

export interface StoredLocalUser {
  id: string
  username: string
  passwordHash: string
  role: 'admin'
  createdAt: number
}

export type NewLocalUser = Omit<StoredLocalUser, 'id' | 'createdAt'>

export interface StoredSession {
  id: string
  userId: string
  createdAt: number
  expiresAt: number
}

export type NewSession = Pick<StoredSession, 'userId' | 'expiresAt'>

export interface DataAdapter {
  listApplications(): Promise<Application[]>
  getApplication(id: string): Promise<Application | null>
  createApplication(input: NewApplication): Promise<Application>
  updateApplication(id: string, patch: Partial<Application>): Promise<void>
  deleteApplication(id: string): Promise<void>

  listPendingUrls(): Promise<PendingUrl[]>
  createPendingUrls(inputs: NewPendingUrl[]): Promise<PendingUrl[]>
  updatePendingUrl(id: string, patch: Partial<PendingUrl>): Promise<void>
  deletePendingUrl(id: string): Promise<void>

  approvePending(pendingId: string, application: NewApplication): Promise<Application>

  countUsers(): Promise<number>
  findUserById(id: string): Promise<StoredLocalUser | null>
  findUserByUsername(username: string): Promise<StoredLocalUser | null>
  createUser(input: NewLocalUser): Promise<StoredLocalUser>
  /**
   * Insert the first admin under a serialized write so two concurrent
   * setup requests can't both succeed. Throws `setup_already_complete`
   * if any user already exists.
   */
  createInitialUser(input: NewLocalUser): Promise<StoredLocalUser>

  createSession(input: NewSession): Promise<StoredSession>
  findSession(id: string): Promise<StoredSession | null>
  deleteSession(id: string): Promise<void>
  deleteExpiredSessions(now: number): Promise<void>

  getAiSettings(): Promise<AiSettingsRow | null>
  setAiSettings(patch: Partial<Omit<AiSettingsRow, 'updatedAt'>>): Promise<void>
}
