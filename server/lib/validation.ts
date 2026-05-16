import { z } from 'zod'

const status = z.enum(['pending', 'applied', 'interview', 'offer', 'rejected'])
const workArrangement = z.enum(['', 'remote', 'hybrid', 'onsite'])
const extraction = z.enum(['idle', 'loading', 'done', 'error'])

export const httpUrlSchema = z.string().superRefine((val, ctx) => {
  let u: URL
  try {
    u = new URL(val)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid_url' })
    return
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', message: 'invalid_url_scheme' })
  }
})

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export const extractedFieldsSchema = z.object({
  company: z.string(),
  role: z.string(),
  salary: z.string(),
  location: z.string(),
  workArrangement,
  source: z.string(),
})

export const newApplicationSchema = z.object({
  url: httpUrlSchema,
  company: z.string().default(''),
  role: z.string().default(''),
  salary: z.string().default(''),
  location: z.string().default(''),
  workArrangement: workArrangement.default(''),
  source: z.string().default(''),
  tags: z.array(z.string()).default([]),
  status: status.default('pending'),
  notes: z.string().default(''),
  deadline: z.number().nullable().default(null),
  followUpDate: z.number().nullable().default(null),
  appliedAt: z.number().nullable().default(null),
  addedBy: z.string().default(''),
  addedByName: z.string().default(''),
}).strict()

export const applicationPatchSchema = z.object({
  url: httpUrlSchema,
  company: z.string(),
  role: z.string(),
  salary: z.string(),
  location: z.string(),
  workArrangement,
  source: z.string(),
  tags: z.array(z.string()),
  status,
  notes: z.string(),
  deadline: z.number().nullable(),
  followUpDate: z.number().nullable(),
  appliedAt: z.number().nullable(),
  addedBy: z.string(),
  addedByName: z.string(),
}).partial().strict()

export const newPendingUrlSchema = z.object({
  url: httpUrlSchema,
  extraction: extraction.default('idle'),
  extracted: extractedFieldsSchema,
  extractError: z.string().default(''),
  addedBy: z.string().default(''),
  addedByName: z.string().default(''),
}).strict()

export const MAX_PENDING_BATCH = 200
export const newPendingUrlsSchema = z.array(newPendingUrlSchema).max(MAX_PENDING_BATCH)

const aiProvider = z.enum([
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'openai-compatible',
])

export const aiSettingsPatchSchema = z
  .object({
    provider: aiProvider,
    apiKey: z.string().max(500),
    model: z.string().max(200),
    baseUrl: z.string().max(500),
  })
  .partial()
  .strict()

export const aiTestSchema = z
  .object({
    provider: aiProvider,
    apiKey: z.string().max(500),
    model: z.string().max(200),
    baseUrl: z.string().max(500),
  })
  .partial()
  .strict()

export const pendingPatchSchema = z.object({
  url: httpUrlSchema,
  extraction,
  extracted: extractedFieldsSchema,
  extractError: z.string(),
  addedBy: z.string(),
  addedByName: z.string(),
}).partial().strict()
