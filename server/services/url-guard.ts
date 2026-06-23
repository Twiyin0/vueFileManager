import dns from 'dns/promises'
import net from 'net'

/**
 * Guards against SSRF for user-supplied remote URLs (remote upload / offline download).
 * Only http(s) is allowed and the resolved address must be a public unicast address,
 * blocking loopback, private, link-local (incl. cloud metadata 169.254.169.254) and
 * reserved ranges. Redirects are followed manually so every hop is re-validated.
 */

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 0) return true // "this" network
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true // loopback / unspecified
  if (lower.startsWith('fe80')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  return false
}

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip)
  if (net.isIPv6(ip)) return isBlockedIpv6(ip)
  return true
}

/** Validate a single URL: protocol + every resolved address must be public. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('file.invalidRemoteUrl')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('file.unsupportedRemoteProtocol')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('file.remoteUrlNotAllowed')
    return url
  }

  let addresses: string[] = []
  try {
    const resolved = await dns.lookup(hostname, { all: true })
    addresses = resolved.map((entry) => entry.address)
  } catch {
    throw new Error('file.remoteUrlNotAllowed')
  }

  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error('file.remoteUrlNotAllowed')
  }

  return url
}

/** Fetch a remote URL with SSRF protection, validating each redirect hop. */
export async function safeFetch(rawUrl: string, maxRedirects = 5): Promise<Response> {
  let currentUrl = rawUrl

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHttpUrl(currentUrl)
    const response = await fetch(currentUrl, { redirect: 'manual' })

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    return response
  }

  throw new Error('file.tooManyRedirects')
}
