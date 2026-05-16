import type { AiSettingsRow, Application, PendingUrl } from '@/types'

export type NewApplication = Omit<Application, 'id' | 'createdAt'>
export type NewPendingUrl = Omit<PendingUrl, 'id' | 'createdAt'>

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

  listAllowedEmails(): Promise<string[]>

  getAiSettings(): Promise<AiSettingsRow | null>
  setAiSettings(patch: Partial<Omit<AiSettingsRow, 'updatedAt'>>): Promise<void>
}
