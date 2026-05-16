import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import applications from './routes/applications.ts'
import pending from './routes/pending.ts'
import auth from './routes/auth.ts'
import extract from './routes/extract.ts'
import settings from './routes/settings.ts'
import { getAdapter } from './lib/db.ts'

function loadEnv(): void {
  if (process.env.DATABASE_URL) return
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  try {
    process.loadEnvFile(path)
  } catch {
    // Node <20.6 — set env via shell instead.
  }
}

loadEnv()

const app = new Hono()

app.route('/api/applications', applications)
app.route('/api/pending', pending)
app.route('/api/auth', auth)
app.route('/api/extract', extract)
app.route('/api/settings', settings)

app.notFound(c => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.text('not_found', 404)
})

const distDir = resolve(process.cwd(), 'dist')
if (existsSync(distDir)) {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT || 3000)

await getAdapter()

console.log(`Listening on http://localhost:${port}`)
console.log(`  AUTH_MODE=${process.env.AUTH_MODE || 'none'}`)
console.log(`  DATABASE_URL=${process.env.DATABASE_URL}`)

export default {
  port,
  fetch: app.fetch,
}
