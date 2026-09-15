import { describe, expect, it, vi } from 'vitest'
import { safeUrl, type Resolver } from './safeUrl'

const publicResolver: Resolver = async () => [{ address: '93.184.216.34', family: 4 }]
const privateResolver: Resolver = async () => [{ address: '10.0.0.1', family: 4 }]
const linkLocalResolver: Resolver = async () => [{ address: '169.254.169.254', family: 4 }]
const ipv6LoopbackResolver: Resolver = async () => [{ address: '::1', family: 6 }]
const ipv6PublicResolver: Resolver = async () => [{ address: '2606:4700::1', family: 6 }]

describe('safeUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    expect(await safeUrl('ftp://example.com', publicResolver)).toEqual({
      ok: false,
      error: 'unsupported_protocol',
    })
  })

  it('rejects unparseable urls', async () => {
    expect(await safeUrl('not a url', publicResolver)).toEqual({ ok: false, error: 'invalid_url' })
  })

  it('rejects literal localhost', async () => {
    expect(await safeUrl('http://localhost:3000', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects .local hostnames', async () => {
    expect(await safeUrl('http://my-printer.local', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects loopback IPv4 literals', async () => {
    expect(await safeUrl('http://127.0.0.1', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects RFC1918 IPv4 literals', async () => {
    expect(await safeUrl('http://10.0.0.1', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
    expect(await safeUrl('http://192.168.1.1', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
    expect(await safeUrl('http://172.16.0.1', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects link-local IPv4 literals (AWS metadata)', async () => {
    expect(await safeUrl('http://169.254.169.254/latest/meta-data', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects IPv6 loopback literal', async () => {
    expect(await safeUrl('http://[::1]', publicResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects hostnames that resolve to private IPs', async () => {
    expect(await safeUrl('https://internal.example.com', privateResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects hostnames that resolve to link-local addresses', async () => {
    expect(await safeUrl('https://metadata.example.com', linkLocalResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('rejects hostnames that resolve to IPv6 loopback', async () => {
    expect(await safeUrl('https://internal.example.com', ipv6LoopbackResolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it('allows public hostnames that resolve to public IPv4', async () => {
    expect(await safeUrl('https://example.com/path', publicResolver)).toEqual({ ok: true })
  })

  it('allows public hostnames that resolve to public IPv6', async () => {
    expect(await safeUrl('https://example.com', ipv6PublicResolver)).toEqual({ ok: true })
  })

  // WHATWG URL parsing normalizes these literals to hex-group form
  // (e.g. `[::ffff:127.0.0.1]` → `::ffff:7f00:1`), which a dotted-quad-only
  // check misses. Each one lands on a private/loopback/metadata IPv4.
  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/latest/meta-data/',
    'http://[::ffff:10.0.0.1]/',
    'http://[::7f00:1]/',
    'http://[::127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[64:ff9b:1::1]/',
    'http://[2002:7f00:1::]/',
    'http://[2002:a9fe:a9fe::1]/',
    'http://[2001:0:4136:e378::1]/',
    'http://[fec0::1]/',
    'http://[fe80::1]/',
    'http://[febf::1]/',
    'http://[fd00::1]/',
    'http://[ff02::1]/',
    'http://[::]/',
    'http://[100::1]/',
    'http://[2001:db8::1]/',
  ])('rejects IPv6 literal that maps to a private address: %s', async url => {
    expect(await safeUrl(url, publicResolver)).toEqual({ ok: false, error: 'private_address' })
  })

  it.each([
    ['::ffff:a9fe:a9fe', 6],
    ['64:ff9b::a00:1', 6],
    ['2002:c0a8:101::1', 6],
    ['fec0::1', 6],
  ] as const)('rejects hostnames resolving to embedded-private IPv6 %s', async (address, family) => {
    const resolver: Resolver = async () => [{ address, family }]
    expect(await safeUrl('https://sneaky.example.com', resolver)).toEqual({
      ok: false,
      error: 'private_address',
    })
  })

  it.each([
    'http://[2606:4700::1111]/',
    'http://[::ffff:93.184.216.34]/',
    'http://[64:ff9b::5db8:d822]/',
    'http://[2002:5db8:d822::1]/',
  ])('allows public IPv6 literal %s', async url => {
    expect(await safeUrl(url, publicResolver)).toEqual({ ok: true })
  })

  it('rejects IPv4 documentation and shared ranges', async () => {
    for (const url of ['http://192.0.2.1', 'http://198.51.100.7', 'http://203.0.113.9', 'http://100.64.0.1']) {
      expect(await safeUrl(url, publicResolver)).toEqual({ ok: false, error: 'private_address' })
    }
  })

  it('returns dns_lookup_failed when resolver throws', async () => {
    const failing: Resolver = vi.fn(async () => {
      throw new Error('NXDOMAIN')
    })
    expect(await safeUrl('https://example.com', failing)).toEqual({
      ok: false,
      error: 'dns_lookup_failed',
    })
  })
})
