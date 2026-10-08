/**
 * Password hashing + token utilities — pure Web Crypto API.
 *
 * Works identically on Node.js (18+) and Cloudflare Workers (no node:crypto
 * needed), uses the platform's native PBKDF2 implementation (async, non-blocking,
 * hardware-accelerated) so hashing stays well inside Workers free-plan CPU limits.
 *
 * Stored format:  pbkdf2$<iterations>$<saltHex>$<hashHex>
 * Passwords are NEVER stored or logged in plaintext.
 */

const ITERATIONS = 100_000
const KEYLEN_BITS = 256

const encoder = new TextEncoder()

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Constant-time comparison (no early return on mismatch). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEYLEN_BITS
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltHex, hashHex] = stored.split('$')
    if (scheme !== 'pbkdf2') return false
    const iterations = parseInt(iterStr, 10)
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 10_000_000) return false
    if (!saltHex || !hashHex) return false
    const actual = await pbkdf2(password, fromHex(saltHex), iterations)
    const expected = fromHex(hashHex)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

/** 32 random bytes → 64 hex chars. Session tokens are random, not derived. */
export function newSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

/** Plain SHA-256 hex — for hashing session tokens at rest (not for passwords). */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toHex(digest)
}
