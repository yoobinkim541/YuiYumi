// Google OAuth (per-user) and an authorized fetch for the Gmail and Calendar REST APIs.
// The access token is refreshed on demand from the user's refresh token; the caller re-seals
// the updated credential into the cookie when `session.updated` is set.

import { createHash } from 'node:crypto'
import { env, NotConnectedError, RejectedError, UpstreamError } from './http'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export const GOOGLE_SCOPES = [GMAIL_SCOPE, CALENDAR_SCOPE]

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export const googleAvailable = () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'))

/** Sealed per-user Google credential. */
export interface GoogleCred {
  p: 'google'
  /** Refresh token. */
  rt: string
  /** Access token and its expiry (epoch ms). */
  at?: string
  exp?: number
  email: string
  /** Granted scopes: Gmail, Calendar (the user may untick one on the consent screen). */
  gm: boolean
  cal: boolean
}

interface TokenResponse { access_token?: string, expires_in?: number, refresh_token?: string, scope?: string, error?: string, error_description?: string }

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID') ?? '', client_secret: env('GOOGLE_CLIENT_SECRET') ?? '', ...params }),
  })
  const data = await res.json().catch(() => ({})) as TokenResponse
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw new NotConnectedError('Google access expired or was revoked. Connect Google again.')
    throw new UpstreamError(`google token HTTP ${res.status}${data.error ? ` (${data.error})` : ''}`)
  }
  return data
}

/** Authorization code exchange (PKCE). Returns the tokens and the granted scopes. */
export async function exchangeGoogleCode(code: string, redirectUri: string, verifier: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })
  if (!t.access_token || !t.refresh_token) throw new UpstreamError('google token response without tokens')
  const scopes = new Set((t.scope ?? '').split(/\s+/))
  return { at: t.access_token, rt: t.refresh_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000, gm: scopes.has(GMAIL_SCOPE), cal: scopes.has(CALENDAR_SCOPE) }
}

export async function revokeGoogle(cred: GoogleCred): Promise<void> {
  await fetch(`${REVOKE_URL}?${new URLSearchParams({ token: cred.rt })}`, { method: 'POST' }).catch(() => undefined)
}

// Access tokens per refresh token within this function instance (saves refreshes when the
// desktop app sends an older blob, or concurrent requests carry the same cookie).
const accessCache = new Map<string, { at: string, exp: number }>()
const rtKey = (rt: string) => createHash('sha256').update(rt).digest('base64url')

export function resetGoogleCache(): void {
  accessCache.clear()
}

export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** One request's view of a user's Google account. */
export class GoogleSession {
  /** Set when the access token was refreshed; the caller re-seals `cred`. */
  updated = false

  constructor(public cred: GoogleCred) {}

  async token(force = false): Promise<string> {
    const now = Date.now()
    if (!force && this.cred.at && (this.cred.exp ?? 0) > now + 60_000) return this.cred.at
    const key = rtKey(this.cred.rt)
    const hit = accessCache.get(key)
    if (!force && hit && hit.exp > now + 60_000) {
      this.cred = { ...this.cred, at: hit.at, exp: hit.exp }
      this.updated = true
      return hit.at
    }
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: this.cred.rt })
    if (!t.access_token) throw new UpstreamError('google refresh without access token')
    const exp = now + (t.expires_in ?? 3600) * 1000
    accessCache.set(key, { at: t.access_token, exp })
    this.cred = { ...this.cred, at: t.access_token, exp }
    this.updated = true
    return t.access_token
  }

  /** JSON request to a Google API. 401 retries once with a fresh token. */
  async api<T>(url: string, init: { method?: string, body?: unknown } = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token(attempt > 0)
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'content-type': 'application/json; charset=utf-8' } : {}) },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      })
      if (res.status === 401 && attempt === 0) continue
      if (res.status === 204) return undefined as T
      const data = await res.json().catch(() => ({})) as T & { error?: { message?: string, status?: string } }
      if (res.ok) return data
      const what = `${init.method ?? 'GET'} ${new URL(url).pathname}`
      const message = data.error?.message ?? `HTTP ${res.status}`
      if (res.status === 401) throw new NotConnectedError('Google access expired or was revoked. Connect Google again.')
      if (res.status === 403 && /insufficient|scope|permission/i.test(message)) throw new NotConnectedError('This Google permission was not granted. Connect Google again and allow it.')
      if (res.status === 400 || res.status === 404 || res.status === 410) throw new GoogleApiError(`${what}: ${message}`, res.status)
      throw new UpstreamError(`google ${what}: ${message}`)
    }
    throw new UpstreamError('google request failed')
  }
}

/** Maps a Google 400/404 (bad or unknown id) to a user-facing refusal. */
export async function orNotFound<T>(p: Promise<T>, message: string): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof GoogleApiError) throw new RejectedError(message, 404)
    throw e
  }
}

/** Runs `fn` over `items` with at most `n` in flight; keeps the order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}
