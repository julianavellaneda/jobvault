import { describe, expect, it, vi } from 'vitest'
import { fetchPage } from './extract'
import type { PinnedFetch } from '../lib/pinnedFetch'
import type { Resolver } from '../lib/safeUrl'

const PUBLIC_IP = '93.184.216.34'
const ATTACKER_HOST = 'rebind.attacker.example'
const PUBLIC_URL = `http://${PUBLIC_IP}/job`
const PUBLIC_REDIRECT_URL = `http://${PUBLIC_IP}/final`

function htmlWithBody(text: string): string {
  return `<!doctype html><html><head><title>Job</title></head><body>${text}</body></html>`
}

const publicResolver: Resolver = async () => [{ address: PUBLIC_IP, family: 4 }]

describe('fetchPage', () => {
  it('validates a redirect target before fetching it', async () => {
    const dial = vi.fn<PinnedFetch>(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
    )

    const result = await fetchPage(PUBLIC_URL, { resolver: publicResolver, dial })

    expect(result).toEqual({ ok: false, error: 'redirect_private_address' })
    expect(dial).toHaveBeenCalledTimes(1)
  })

  it('follows public redirects manually', async () => {
    const dial = vi.fn<PinnedFetch>(async parsed => {
      if (parsed.toString() === PUBLIC_URL) {
        return new Response(null, {
          status: 302,
          headers: { location: PUBLIC_REDIRECT_URL },
        })
      }
      return new Response(
        htmlWithBody(
          'Senior software engineer role at Example Company with enough detail to pass the extractor minimum text length.',
        ),
        { status: 200 },
      )
    })

    const result = await fetchPage(PUBLIC_URL, { resolver: publicResolver, dial })

    expect(result.ok).toBe(true)
    expect(dial).toHaveBeenCalledTimes(2)
  })

  it('pins the dialled IP to the value validated by the resolver (DNS rebinding)', async () => {
    // The resolver returns a public IP; we assert the dial target equals that
    // IP. In the real exploit, the runtime would re-resolve after validation
    // and dial a different (private) IP — pinning forecloses that.
    let observedIp = ''
    const dial = vi.fn<PinnedFetch>(async (_parsed, ip) => {
      observedIp = ip
      return new Response(
        htmlWithBody(
          'A senior software engineering position at Example with body content long enough to pass the extractor minimum length check easily.',
        ),
        { status: 200 },
      )
    })

    const result = await fetchPage(`http://${ATTACKER_HOST}/job`, {
      resolver: publicResolver,
      dial,
    })

    expect(result.ok).toBe(true)
    expect(observedIp).toBe(PUBLIC_IP)
  })

  it('does not echo connection errors (no port-scan oracle)', async () => {
    const dial = vi.fn<PinnedFetch>(async () => {
      throw new Error('connect ECONNREFUSED 93.184.216.34:6379 — redis banner')
    })

    const result = await fetchPage(PUBLIC_URL, { resolver: publicResolver, dial })

    expect(result).toEqual({ ok: false, error: 'fetch_failed' })
  })

  it('rejects IPv4-mapped IPv6 literals before dialling', async () => {
    const dial = vi.fn<PinnedFetch>()

    const result = await fetchPage('http://[::ffff:a9fe:a9fe]/latest/meta-data/', { dial })

    expect(result).toEqual({ ok: false, error: 'private_address' })
    expect(dial).not.toHaveBeenCalled()
  })

  it('rejects rebinding to a private IP on a redirect hop', async () => {
    const rebindingResolver: Resolver = vi.fn(async (host: string) => {
      if (host === ATTACKER_HOST) return [{ address: PUBLIC_IP, family: 4 }]
      return [{ address: '169.254.169.254', family: 4 }]
    })
    const dial = vi.fn<PinnedFetch>(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://imds.attacker.example/latest/meta-data' },
      }),
    )

    const result = await fetchPage(`http://${ATTACKER_HOST}/job`, {
      resolver: rebindingResolver,
      dial,
    })

    expect(result).toEqual({ ok: false, error: 'redirect_private_address' })
    expect(dial).toHaveBeenCalledTimes(1)
  })
})
