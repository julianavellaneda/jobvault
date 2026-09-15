import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type SafeUrlResult = { ok: true } | { ok: false; error: string }
export type ResolvedAddress = { address: string; family: 4 | 6 }
export type ResolvedSafeUrlResult =
  | { ok: true; parsed: URL; addresses: ResolvedAddress[] }
  | { ok: false; error: string }

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', 'broadcasthost'])

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  if (bytes.some(n => Number.isNaN(n) || n > 255)) return null
  return bytes
}

function isPrivateIPv4Bytes([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 192 && b === 88 && c === 99) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

/**
 * Expand an IPv6 literal into its 16 bytes. Handles `::` compression, a
 * trailing dotted-quad (`::ffff:1.2.3.4`) and zone ids. Returns null if the
 * input isn't a well-formed address.
 */
export function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const zone = s.indexOf('%')
  if (zone !== -1) s = s.slice(0, zone)

  const lastColon = s.lastIndexOf(':')
  if (lastColon === -1) return null
  const tail = s.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail)
    if (!v4) return null
    const hi = ((v4[0] << 8) | v4[1]).toString(16)
    const lo = ((v4[2] << 8) | v4[3]).toString(16)
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  let groups: string[]
  if (halves.length === 2) {
    const rest = halves[1] ? halves[1].split(':') : []
    const fill = 8 - head.length - rest.length
    if (fill < 1) return null
    groups = [...head, ...Array<string>(fill).fill('0'), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const bytes: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    const n = parseInt(g, 16)
    bytes.push(n >> 8, n & 0xff)
  }
  return bytes
}

function isPrivateIPv6Bytes(bytes: number[]): boolean {
  const zeros = (from: number, to: number) => bytes.slice(from, to).every(b => b === 0)

  // IPv4-mapped ::ffff:0:0/96 — the dangerous one: `[::ffff:7f00:1]` is 127.0.0.1.
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIPv4Bytes(bytes.slice(12))
  }
  // NAT64 64:ff9b::/96 embeds an IPv4 address (DNS64 hosts resolve public
  // IPv4-only sites to these, so unwrap rather than block outright).
  // 64:ff9b:1::/48 is the local-use NAT64 prefix — never public.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
    return zeros(4, 12) ? isPrivateIPv4Bytes(bytes.slice(12)) : true
  }

  // Everything else must be global unicast (2000::/3). This rejects ::, ::1,
  // IPv4-compatible ::/96, discard 100::/64, ULA fc00::/7, link-local
  // fe80::/10, site-local fec0::/10 and multicast ff00::/8 in one check.
  if ((bytes[0] & 0xe0) !== 0x20) return true

  // 6to4 2002::/16 embeds an IPv4 address in bytes 2-5.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPrivateIPv4Bytes(bytes.slice(2, 6))
  // Teredo 2001::/32 carries an obfuscated IPv4 endpoint; nothing legitimate
  // to fetch there.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true
  // Documentation 2001:db8::/32.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const bytes = parseIPv4(ip)
    return bytes ? isPrivateIPv4Bytes(bytes) : true
  }
  if (v === 6) {
    const bytes = parseIPv6(ip)
    return bytes ? isPrivateIPv6Bytes(bytes) : true
  }
  return true
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>

const defaultResolver: Resolver = async hostname => {
  const records = await lookup(hostname, { all: true })
  return records.map(r => ({ address: r.address, family: r.family as 4 | 6 }))
}

export async function resolveSafeUrl(
  input: string,
  resolver: Resolver = defaultResolver,
): Promise<ResolvedSafeUrlResult> {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' }
  }
  const rawHost = parsed.hostname.toLowerCase()
  if (!rawHost) return { ok: false, error: 'invalid_url' }
  const hostname =
    rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost
  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, error: 'private_address' }
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { ok: false, error: 'private_address' }
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) return { ok: false, error: 'private_address' }
    return { ok: true, parsed, addresses: [{ address: hostname, family: isIP(hostname) as 4 | 6 }] }
  }
  let records: ResolvedAddress[]
  try {
    records = await resolver(hostname)
  } catch {
    return { ok: false, error: 'dns_lookup_failed' }
  }
  if (records.length === 0) return { ok: false, error: 'dns_lookup_failed' }
  for (const r of records) {
    if (isPrivateAddress(r.address)) return { ok: false, error: 'private_address' }
  }
  return { ok: true, parsed, addresses: records }
}

export async function safeUrl(input: string, resolver: Resolver = defaultResolver): Promise<SafeUrlResult> {
  const result = await resolveSafeUrl(input, resolver)
  return result.ok ? { ok: true } : result
}
