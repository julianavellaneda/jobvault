// Interface the HTTP server binds to. Loopback by default so a source install
// or the desktop sidecar isn't reachable from the LAN; the Docker image sets
// HOST=0.0.0.0 because container port publishing needs it.
export function listenHost(): string {
  return process.env.HOST?.trim() || '127.0.0.1'
}

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'localhost' || h === '::1' || h.startsWith('127.')
}
