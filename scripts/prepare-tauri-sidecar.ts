import { execSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  chmodSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { platform, arch } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const TAURI_DIR = resolve(ROOT, 'src-tauri')
const BINARIES_DIR = resolve(TAURI_DIR, 'binaries')
const RESOURCES_DIR = resolve(TAURI_DIR, 'resources')
const DIST_SERVER = resolve(ROOT, 'dist-server')
const DIST_WEB = resolve(ROOT, 'dist')

function hostTargetTriple(): string {
  // Match Tauri's expected sidecar suffix per `rustc -vV | grep host`.
  try {
    const out = execSync('rustc -vV', { encoding: 'utf8' })
    const m = out.match(/host:\s*(\S+)/)
    if (m) return m[1]
  } catch {
    // fall through to platform-based fallback
  }
  const p = platform()
  const a = arch()
  if (p === 'darwin') return a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  if (p === 'linux') return a === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
  if (p === 'win32') return 'x86_64-pc-windows-msvc'
  throw new Error(`unsupported platform: ${p}/${a}`)
}

function findHostNode(): string {
  const cmd = process.platform === 'win32' ? 'where node' : 'which node'
  const out = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
  if (!out || !existsSync(out)) {
    throw new Error('node not found on PATH — install Node 20+ before running tauri:prepare')
  }
  return out
}

function copyNodeBinary(triple: string) {
  mkdirSync(BINARIES_DIR, { recursive: true })
  const src = findHostNode()
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const dest = resolve(BINARIES_DIR, `jobvault-node-${triple}${suffix}`)
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log(`✓ sidecar binary → ${dest}`)
  console.log(`  source: ${src} (${(statSync(src).size / 1024 / 1024).toFixed(1)} MB)`)
}

function copyServerBundle() {
  if (!existsSync(DIST_SERVER) || !existsSync(resolve(DIST_SERVER, 'server.mjs'))) {
    throw new Error(
      `dist-server/server.mjs not found — run "bun run build:server" first`,
    )
  }
  if (existsSync(RESOURCES_DIR)) rmSync(RESOURCES_DIR, { recursive: true, force: true })
  mkdirSync(RESOURCES_DIR, { recursive: true })
  copyFileSync(resolve(DIST_SERVER, 'server.mjs'), resolve(RESOURCES_DIR, 'server.mjs'))
  if (existsSync(resolve(DIST_SERVER, 'server.mjs.map'))) {
    copyFileSync(
      resolve(DIST_SERVER, 'server.mjs.map'),
      resolve(RESOURCES_DIR, 'server.mjs.map'),
    )
  }
  cpSync(resolve(DIST_SERVER, 'migrations'), resolve(RESOURCES_DIR, 'migrations'), {
    recursive: true,
  })
  // better-sqlite3 is a native module — its prebuilt .node binary must travel
  // alongside the bundle. Copy the entire dist tree (small).
  const nativeSrc = resolve(ROOT, 'node_modules', 'better-sqlite3')
  const nativeDest = resolve(RESOURCES_DIR, 'node_modules', 'better-sqlite3')
  cpSync(nativeSrc, nativeDest, {
    recursive: true,
    filter: src => !src.includes('/.git/'),
  })
  // bindings dep
  const bindingsSrc = resolve(ROOT, 'node_modules', 'bindings')
  if (existsSync(bindingsSrc)) {
    cpSync(bindingsSrc, resolve(RESOURCES_DIR, 'node_modules', 'bindings'), {
      recursive: true,
    })
  }
  const fileUriToPathSrc = resolve(ROOT, 'node_modules', 'file-uri-to-path')
  if (existsSync(fileUriToPathSrc)) {
    cpSync(fileUriToPathSrc, resolve(RESOURCES_DIR, 'node_modules', 'file-uri-to-path'), {
      recursive: true,
    })
  }
  // The sidecar Hono server serves the SPA from DIST_DIR (set by Rust to
  // <resources>/resources/dist). Tauri's own frontendDist isn't accessible to
  // child processes, so we copy dist/ in alongside the server bundle.
  if (!existsSync(resolve(DIST_WEB, 'index.html'))) {
    throw new Error(`dist/index.html not found — run "bun run build" first`)
  }
  cpSync(DIST_WEB, resolve(RESOURCES_DIR, 'dist'), { recursive: true })
  console.log(`✓ server bundle → ${RESOURCES_DIR}`)
}

function ensurePrebuiltAssets() {
  // Server bundle: build if missing.
  if (!existsSync(resolve(DIST_SERVER, 'server.mjs'))) {
    console.log('… running bun run build:server')
    execSync('bun run build:server', { stdio: 'inherit', cwd: ROOT })
  }
  // Vite bundle: build if missing (the bundled server serves dist/).
  if (!existsSync(resolve(ROOT, 'dist', 'index.html'))) {
    console.log('… running bun run build')
    execSync('bun run build', { stdio: 'inherit', cwd: ROOT })
  }
}

function main() {
  console.log(`tauri:prepare — host: ${platform()}/${arch()}`)
  ensurePrebuiltAssets()
  const triple = hostTargetTriple()
  console.log(`  target triple: ${triple}`)
  copyNodeBinary(triple)
  copyServerBundle()
  console.log('\n✓ src-tauri/ ready')
}

main()
