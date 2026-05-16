export type Status = 'pending' | 'applied' | 'interview' | 'offer' | 'rejected'
export const STATUSES: Status[] = ['pending', 'applied', 'interview', 'offer', 'rejected']

export type WorkArrangement = 'remote' | 'hybrid' | 'onsite' | ''
export const WORK_ARRANGEMENTS: WorkArrangement[] = ['', 'remote', 'hybrid', 'onsite']

export interface Application {
  id: string
  url: string
  company: string
  role: string
  salary: string
  location: string
  workArrangement: WorkArrangement
  source: string
  tags: string[]
  status: Status
  notes: string
  deadline: number | null
  followUpDate: number | null
  appliedAt: number | null
  createdAt: number | null
  addedBy: string
  addedByName: string
}

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
}

export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'minimax'
  | 'openrouter'
  | 'openai-compatible'

export const AI_PROVIDER_IDS: AiProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'openai-compatible',
]

export interface AiSettingsRow {
  provider: AiProviderId
  apiKey: string
  model: string
  baseUrl: string
  updatedAt: number
}

export type PendingExtractStatus = 'idle' | 'loading' | 'done' | 'error'

export type ExtractedFields = {
  company: string
  role: string
  salary: string
  location: string
  workArrangement: WorkArrangement
  source: string
}

export interface PendingUrl {
  id: string
  url: string
  hostname: string
  extraction: PendingExtractStatus
  extracted: ExtractedFields
  extractError: string
  addedBy: string
  addedByName: string
  createdAt: number | null
}
