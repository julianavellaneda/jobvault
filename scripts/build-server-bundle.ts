import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(ROOT, 'dist-server')
const ENTRY = resolve(ROOT, 'server/index.ts')
const MIGRATIONS_SRC = resolve(ROOT, 'src/storage/sqlite/migrations')
const MIGRATIONS_DEST = resolve(OUT_DIR, 'migrations')

async function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: resolve(OUT_DIR, 'server.mjs'),
    sourcemap: 'linked',
    legalComments: 'none',
    minify: false,
    logLevel: 'info',
    alias: {
      '@': resolve(ROOT, 'src'),
    },
    banner: {
      // Native CommonJS modules (e.g. better-sqlite3) are loaded via require()
      // from the dynamically-imported bun-only branches as well; ensure both
      // require() and __dirname resolve inside the ESM bundle.
      js: [
        "import { createRequire as __createRequire } from 'module';",
        "import { fileURLToPath as __fileURLToPath } from 'url';",
        "import { dirname as __dirname_fn } from 'path';",
        "const require = __createRequire(import.meta.url);",
        "const __filename = __fileURLToPath(import.meta.url);",
        "const __dirname = __dirname_fn(__filename);",
        '/* Jobvault desktop server bundle — do not edit. */',
      ].join('\n'),
    },
    // bun:sqlite is a Bun built-in; better-sqlite3 is a native module — both
    // stay external. The runtime branch in src/storage/sqlite/client.ts only
    // touches `bun:sqlite` under Bun, so the unresolved require is dead code
    // when the bundle runs on Node.
    external: [
      'bun:sqlite',
      'better-sqlite3',
      // Bun-only Drizzle adapter is dynamically imported behind isBunRuntime();
      // keep it external so Node never tries to resolve it.
      'drizzle-orm/bun-sqlite',
      'drizzle-orm/bun-sqlite/migrator',
      // Bun-only Hono static helper, also gated by runtime.
      'hono/bun',
    ],
  })

  if (result.errors.length > 0) {
    console.error(result.errors)
    process.exit(1)
  }

  cpSync(MIGRATIONS_SRC, MIGRATIONS_DEST, { recursive: true })

  console.log(`\n✓ bundled → ${resolve(OUT_DIR, 'server.mjs')}`)
  console.log(`✓ migrations → ${MIGRATIONS_DEST}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
