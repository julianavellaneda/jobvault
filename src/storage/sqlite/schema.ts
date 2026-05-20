import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type {
  AiProviderId,
  ExtractedFields,
  PendingExtractStatus,
  Status,
  WorkArrangement,
} from '@/types'

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  company: text('company').notNull().default(''),
  role: text('role').notNull().default(''),
  salary: text('salary').notNull().default(''),
  location: text('location').notNull().default(''),
  workArrangement: text('work_arrangement').$type<WorkArrangement>().notNull().default(''),
  source: text('source').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  status: text('status').$type<Status>().notNull().default('pending'),
  notes: text('notes').notNull().default(''),
  deadline: integer('deadline'),
  followUpDate: integer('follow_up_date'),
  appliedAt: integer('applied_at'),
  createdAt: integer('created_at').notNull(),
  addedBy: text('added_by').notNull().default(''),
  addedByName: text('added_by_name').notNull().default(''),
})

export const pendingUrls = sqliteTable('pending_urls', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  hostname: text('hostname').notNull().default(''),
  extraction: text('extraction').$type<PendingExtractStatus>().notNull().default('idle'),
  extracted: text('extracted', { mode: 'json' }).$type<ExtractedFields>().notNull(),
  extractError: text('extract_error').notNull().default(''),
  addedBy: text('added_by').notNull().default(''),
  addedByName: text('added_by_name').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').$type<'admin'>().notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
})

// Single-row table: id is always 'singleton'. Holds the in-app AI provider
// config used only as a fallback when no AI_* env vars are set (see
// server/lib/aiConfig.ts — env always wins, mirroring allowlist policy).
export const aiSettings = sqliteTable('ai_settings', {
  id: text('id').primaryKey(),
  provider: text('provider').$type<AiProviderId>().notNull().default('minimax'),
  apiKey: text('api_key').notNull().default(''),
  model: text('model').notNull().default(''),
  baseUrl: text('base_url').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
})
