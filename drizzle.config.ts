import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/storage/libsql/schema.ts',
  out: './src/storage/libsql/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/app.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
})
