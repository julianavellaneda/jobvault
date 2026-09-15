import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import applications from './routes/applications.ts'
import pending from './routes/pending.ts'
import auth from './routes/auth.ts'
import extract from './routes/extract.ts'
import settings from './routes/settings.ts'
import { getAdapter } from './lib/db.ts'
import { listenHost } from './lib/listenHost.ts'
import { assertSessionSecret } from './lib/session.ts'
import { announceSetupToken } from './lib/setupToken.ts'

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
}

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
assertSessionSecret()

const app = new Hono()

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Radix positions popovers/tooltips with inline style attributes.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    // HSTS belongs to the TLS-terminating proxy, not a plain-HTTP app server.
    strictTransportSecurity: false,
  }),
)
// Rejects cross-site form posts (form-encoded / multipart / text/plain) whose
// Origin or Sec-Fetch-Site isn't this site. JSON is covered in parseBody.
app.use('/api/*', csrf())

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

const distDir = process.env.DIST_DIR
  ? resolve(process.env.DIST_DIR)
  : resolve(process.cwd(), 'dist')
const distExists = existsSync(distDir)

if (distExists) {
  // serveStatic resolves `root` relative to process.cwd(), so anchor cwd at
  // the dist parent when DIST_DIR was provided (e.g. Tauri sidecar mode).
  if (process.env.DIST_DIR) {
    process.chdir(resolve(distDir, '..'))
  }
  if (isBunRuntime()) {
    const { serveStatic } = await import('hono/bun')
    app.use('/*', serveStatic({ root: './dist' }))
    app.get('*', serveStatic({ path: './dist/index.html' }))
  } else {
    const { serveStatic } = await import('@hono/node-server/serve-static')
    app.use('/*', serveStatic({ root: './dist' }))
    app.get('*', serveStatic({ path: './dist/index.html' }))
  }
}

const port = Number(process.env.PORT || 3000)
const hostname = listenHost()

const adapter = await getAdapter()
await (await import('./lib/bootstrap.ts')).maybeBootstrapAdmin()
if ((await adapter.countUsers()) === 0) announceSetupToken()

function logListening(p: number): void {
  const shown = hostname.includes(':') ? `[${hostname}]` : hostname
  console.log(`Listening on http://${shown}:${p}`)
  console.log(`  DATABASE_URL=${process.env.DATABASE_URL ?? 'file:./data/app.db'}`)
}

if (isBunRuntime()) {
  logListening(port)
} else {
  const { serve } = await import('@hono/node-server')
  serve({ fetch: app.fetch, port, hostname }, info => logListening(info.port))
}

// Bun picks up this default export and starts its own HTTP server.
// Under Node, the @hono/node-server serve() call above already bound the port,
// so this export is effectively a no-op there.
export default {
  port,
  hostname,
  fetch: app.fetch,
}
