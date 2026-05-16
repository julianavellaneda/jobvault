import type { AiSettingsRow, Application, PendingUrl } from '@/types'
import type { DataAdapter, NewApplication, NewPendingUrl } from '../adapter'
import { apiFetch } from './client'

function stripHostname<T extends { hostname?: string }>(input: T): Omit<T, 'hostname'> {
  const copy = { ...input }
  delete copy.hostname
  return copy
}

export class RestDataAdapter implements DataAdapter {
  listApplications(): Promise<Application[]> {
    return apiFetch<Application[]>('/api/applications')
  }

  async getApplication(id: string): Promise<Application | null> {
    const all = await this.listApplications()
    return all.find(a => a.id === id) ?? null
  }

  createApplication(input: NewApplication): Promise<Application> {
    return apiFetch<Application>('/api/applications', { method: 'POST', body: input })
  }

  async updateApplication(id: string, patch: Partial<Application>): Promise<void> {
    await apiFetch(`/api/applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })
  }

  async deleteApplication(id: string): Promise<void> {
    await apiFetch(`/api/applications/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  listPendingUrls(): Promise<PendingUrl[]> {
    return apiFetch<PendingUrl[]>('/api/pending')
  }

  createPendingUrls(inputs: NewPendingUrl[]): Promise<PendingUrl[]> {
    if (inputs.length === 0) return Promise.resolve([])
    // Server derives hostname from url; the strict schema rejects extras.
    const body = inputs.map(stripHostname)
    return apiFetch<PendingUrl[]>('/api/pending', { method: 'POST', body })
  }

  async updatePendingUrl(id: string, patch: Partial<PendingUrl>): Promise<void> {
    await apiFetch(`/api/pending/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: stripHostname(patch),
    })
  }

  async deletePendingUrl(id: string): Promise<void> {
    await apiFetch(`/api/pending/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  approvePending(pendingId: string, application: NewApplication): Promise<Application> {
    return apiFetch<Application>(`/api/pending/${encodeURIComponent(pendingId)}/approve`, {
      method: 'POST',
      body: application,
    })
  }

  async listAllowedEmails(): Promise<string[]> {
    throw new Error('listAllowedEmails is server-only')
  }

  // AI settings flow through the dedicated /api/settings/* endpoints
  // (src/lib/aiSettings.ts), not the storage adapter.
  async getAiSettings(): Promise<AiSettingsRow | null> {
    throw new Error('getAiSettings is server-only')
  }

  async setAiSettings(): Promise<void> {
    throw new Error('setAiSettings is server-only')
  }
}

export const restAdapter = new RestDataAdapter()
