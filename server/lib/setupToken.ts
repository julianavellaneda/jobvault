import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isLoopbackHost, listenHost } from './listenHost.ts'

// First-run setup creates the admin account, so on a network-reachable
// instance whoever loads the page first would own it. When the server listens
// beyond loopback, setup additionally requires a one-time token that is only
// visible to the operator (server logs, or SETUP_TOKEN if they set one).

let token: string | null = null

export function setupTokenRequired(): boolean {
  return !isLoopbackHost(listenHost())
}

export function getSetupToken(): string {
  if (!token) token = process.env.SETUP_TOKEN?.trim() || randomBytes(18).toString('base64url')
  return token
}

export function verifySetupToken(input: string | undefined): boolean {
  if (!setupTokenRequired()) return true
  if (!input) return false
  const given = Buffer.from(input.trim())
  const expected = Buffer.from(getSetupToken())
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function announceSetupToken(): void {
  if (!setupTokenRequired()) return
  const line = '─'.repeat(60)
  console.log(
    [
      line,
      '  First-run setup is open and this server is network-reachable.',
      '  Enter this one-time setup token on the setup page:',
      '',
      `      ${getSetupToken()}`,
      '',
      '  (Set ADMIN_USERNAME + ADMIN_PASSWORD to skip the setup page.)',
      line,
    ].join('\n'),
  )
}

export function _resetSetupTokenForTests(): void {
  token = null
}
