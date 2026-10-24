// Sealed blobs for provider tokens: AES-256-GCM with a key derived from AUTH_SECRET. The
// server keeps no session store; the browser holds the blob in an httpOnly cookie (the
// desktop app sends it as a bearer token) and cannot read or alter it.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from './http'

const IV = 12
const TAG = 16
let cached: { secret: string, key: Buffer } | null = null

function key(): Buffer | null {
  const secret = env('AUTH_SECRET')
  if (!secret || secret.length < 32) return null
  if (cached?.secret !== secret) {
    cached = { secret, key: Buffer.from(hkdfSync('sha256', secret, 'yuiyumi', 'sealed-blob-v1', 32)) }
  }
  return cached.key
}

/** AUTH_SECRET is set (at least 32 characters). */
export const sealConfigured = (): boolean => key() !== null

/**
 * Encrypts `data` for `purpose` (bound as associated data, so an OAuth state blob cannot be
 * replayed as a session) with an expiry. Returns base64url.
 */
export function seal(purpose: string, data: unknown, ttlSec: number, now = Date.now()): string {
  const k = key()
  if (!k) throw new Error('AUTH_SECRET is not set (32+ characters)')
  const iv = randomBytes(IV)
  const c = createCipheriv('aes-256-gcm', k, iv)
  c.setAAD(Buffer.from(purpose))
  const body = Buffer.concat([c.update(JSON.stringify({ d: data, exp: now + ttlSec * 1000 }), 'utf8'), c.final()])
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64url')
}

/** Returns null for tampered, foreign-purpose or expired blobs. */
export function unseal<T>(purpose: string, blob: string, now = Date.now()): T | null {
  const k = key()
  if (!k || !blob) return null
  try {
    const raw = Buffer.from(blob, 'base64url')
    if (raw.length <= IV + TAG) return null
    const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, IV))
    d.setAAD(Buffer.from(purpose))
    d.setAuthTag(raw.subarray(raw.length - TAG))
    const text = Buffer.concat([d.update(raw.subarray(IV, raw.length - TAG)), d.final()]).toString('utf8')
    const parsed = JSON.parse(text) as { d: T, exp: number }
    return parsed.exp > now ? parsed.d : null
  } catch {
    return null
  }
}
