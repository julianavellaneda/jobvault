import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/storage/sqlite/schema.ts',
  out: './src/storage/sqlite/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/app.db',
  },
})
