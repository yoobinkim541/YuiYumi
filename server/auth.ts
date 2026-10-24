// Per-user OAuth for the live connectors. Each provider has start / callback / logout
// routes (api/auth/<provider>/[service].ts). Tokens are sealed (server/seal.ts) into one
// httpOnly cookie per provider; the desktop app gets the same sealed blob through a
// 127.0.0.1 loopback redirect and sends it back as `Authorization: Bearer <blob>[,<blob>...]`.

import { createHash, randomBytes } from 'node:crypto'
import { LIVE_PROVIDERS, type AuthStatus, type LiveProvider, type LiveService } from '../shared/contracts.js'
import { outboundLimits } from './budget.js'
import { DISCORD_BOT_PERMISSIONS, DISCORD_SCOPES, discordAvailable, exchangeDiscordCode, type DiscordCred } from './discord.js'
import { CALENDAR_SCOPE, exchangeGoogleCode, GMAIL_SCOPE, GoogleSession, googleAvailable, revokeGoogle, type GoogleCred } from './google.js'
import { cookie, env, fail, json, NotConnectedError, originOf, parseCookies, redirect } from './http.js'
import { exchangeSlackCode, revokeSlack, SLACK_USER_SCOPES, slackAvailable, type SlackCred } from './slack.js'
import { seal, sealConfigured, unseal } from './seal.js'

export type Cred = GoogleCred | SlackCred | DiscordCred
export type Creds = { google?: GoogleCred, slack?: SlackCred, discord?: DiscordCred }

const SESSION = 'session'
const OAUTH = 'oauth'
/** Connected providers stay for 30 days (Google Testing-mode grants end after about 7). */
const SESSION_TTL = 60 * 60 * 24 * 30
const OAUTH_TTL = 600

export const credCookieName = (p: LiveProvider) => `yy_${p}`
const oauthCookieName = (p: LiveProvider) => `yy_oauth_${p}`

const isProvider = (p: unknown): p is LiveProvider => LIVE_PROVIDERS.includes(p as LiveProvider)

/** Credentials from the provider cookies and/or a bearer header (desktop app). */
export function readCreds(request: Request): { creds: Creds, fromCookie: Set<LiveProvider> } {
  const creds: Creds = {}
  const fromCookie = new Set<LiveProvider>()
  const cookies = parseCookies(request.headers.get('cookie'))
  const put = (blob: string | undefined, viaCookie: boolean) => {
    const c = blob ? unseal<Cred>(SESSION, blob.trim()) : null
    if (!c || !isProvider(c.p)) return
    ;(creds as Record<LiveProvider, Cred>)[c.p] = c
    if (viaCookie) fromCookie.add(c.p)
    else fromCookie.delete(c.p)
  }
  for (const p of LIVE_PROVIDERS) put(cookies[credCookieName(p)], true)
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  for (const b of bearer?.split(',') ?? []) put(b, false)
  return { creds, fromCookie }
}

const isSecure = (request: Request) => originOf(request).startsWith('https:')

export function sealCred(cred: Cred): string {
  return seal(SESSION, cred, SESSION_TTL)
}

export function credCookie(request: Request, cred: Cred): string {
  return cookie(credCookieName(cred.p), sealCred(cred), { maxAge: SESSION_TTL, secure: isSecure(request) })
}

export function clearCredCookie(request: Request, p: LiveProvider): string {
  return cookie(credCookieName(p), '', { maxAge: 0, secure: isSecure(request) })
}

// ---------------------------------------------------------------------------
// Providers

interface ProviderDef {
  available(): boolean
  authorizeUrl(o: { redirectUri: string, state: string, challenge: string }): string
  exchange(o: { code: string, redirectUri: string, verifier: string }): Promise<Cred>
  revoke(cred: Cred): Promise<void>
}

const PROVIDERS: Record<LiveProvider, ProviderDef> = {
  google: {
    available: googleAvailable,
    authorizeUrl: ({ redirectUri, state, challenge }) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID') ?? '', redirect_uri: redirectUri, response_type: 'code',
      scope: [GMAIL_SCOPE, CALENDAR_SCOPE].join(' '), access_type: 'offline', prompt: 'consent',
      include_granted_scopes: 'true', state, code_challenge: challenge, code_challenge_method: 'S256',
    })}`,
    async exchange({ code, redirectUri, verifier }) {
      const t = await exchangeGoogleCode(code, redirectUri, verifier)
      const s = new GoogleSession({ p: 'google', rt: t.rt, at: t.at, exp: t.exp, email: '', gm: t.gm, cal: t.cal })
      return { ...s.cred, email: await googleEmail(s) }
    },
    revoke: c => revokeGoogle(c as GoogleCred),
  },
  slack: {
    available: slackAvailable,
    authorizeUrl: ({ redirectUri, state }) => `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
      client_id: env('SLACK_CLIENT_ID') ?? '', user_scope: SLACK_USER_SCOPES.join(','), redirect_uri: redirectUri, state,
    })}`,
    exchange: ({ code, redirectUri }) => exchangeSlackCode(code, redirectUri),
    revoke: c => revokeSlack(c as SlackCred),
  },
  discord: {
    available: discordAvailable,
    authorizeUrl: ({ redirectUri, state }) => `https://discord.com/oauth2/authorize?${new URLSearchParams({
      client_id: env('DISCORD_CLIENT_ID') ?? '', response_type: 'code', redirect_uri: redirectUri,
      scope: DISCORD_SCOPES.join(' '), permissions: DISCORD_BOT_PERMISSIONS, integration_type: '0', state,
    })}`,
    exchange: ({ code, redirectUri }) => exchangeDiscordCode(code, redirectUri),
    // The bot stays on the server until the user removes it there; nothing to revoke.
    revoke: async () => undefined,
  },
}

/** The account address: Gmail profile, or the primary calendar's id. */
async function googleEmail(s: GoogleSession): Promise<string> {
  if (s.cred.gm) {
    const p = await s.api<{ emailAddress?: string }>('https://gmail.googleapis.com/gmail/v1/users/me/profile').catch(() => ({ emailAddress: undefined }))
    if (p.emailAddress) return p.emailAddress
  }
  if (s.cred.cal) {
    const c = await s.api<{ summary?: string }>('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1').catch(() => ({ summary: undefined }))
    if (c.summary) return c.summary
  }
  return 'Google'
}

export function accountName(cred: Cred): string {
  switch (cred.p) {
    case 'google': return cred.email
    case 'slack': return cred.team
    case 'discord': return cred.guildName
  }
}

export function servicesOf(cred: Cred): LiveService[] {
  switch (cred.p) {
    case 'google': return [...(cred.gm ? ['mail' as const] : []), ...(cred.cal ? ['calendar' as const] : [])]
    case 'slack': return ['slack']
    case 'discord': return ['discord']
  }
}

export function authStatus(request: Request): AuthStatus {
  const { creds } = readCreds(request)
  const providers = {} as AuthStatus['providers']
  for (const p of LIVE_PROVIDERS) {
    const c = creds[p]
    const available = sealConfigured() && PROVIDERS[p].available()
    providers[p] = c && available
      ? { available, connected: true, account: accountName(c), services: servicesOf(c) }
      : { available, connected: false, services: [] }
  }
  return { providers, limits: outboundLimits() }
}

// ---------------------------------------------------------------------------
// Routes

interface OAuthState {
  p: LiveProvider
  state: string
  verifier: string
  ret: string
  desktop?: { port: number, nonce: string }
}

const b64url = (b: Buffer) => b.toString('base64url')

/** Same-origin path to return to (no open redirects). */
function safeReturn(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/'
}

function withQuery(origin: string, path: string, params: Record<string, string>): string {
  const u = new URL(path, origin)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return `${u.pathname}${u.search}${u.hash}`
}

const callbackUri = (request: Request, p: LiveProvider) => `${originOf(request)}/api/auth/${p}/callback`

function start(request: Request, p: LiveProvider): Response {
  const url = new URL(request.url)
  const ret = safeReturn(url.searchParams.get('return'))
  const back = (reason: string) => redirect(withQuery(originOf(request), ret, { connect_error: p, reason }))
  if (!sealConfigured() || !PROVIDERS[p].available()) return back('unavailable')

  let desktop: OAuthState['desktop']
  if (url.searchParams.get('client') === 'desktop') {
    const port = Number(url.searchParams.get('port'))
    const nonce = url.searchParams.get('nonce') ?? ''
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[\w-]{8,64}$/.test(nonce)) return fail(400, 'desktop login needs port and nonce', 'bad_request')
    desktop = { port, nonce }
  }

  const verifier = b64url(randomBytes(32))
  const st: OAuthState = { p, state: b64url(randomBytes(16)), verifier, ret, ...(desktop ? { desktop } : {}) }
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const location = PROVIDERS[p].authorizeUrl({ redirectUri: callbackUri(request, p), state: st.state, challenge })
  // Scoped to this provider's callback path; expires on its own (one Set-Cookie per response).
  return redirect(location, cookie(oauthCookieName(p), seal(OAUTH, st, OAUTH_TTL), { maxAge: OAUTH_TTL, path: `/api/auth/${p}/callback`, secure: isSecure(request) }))
}

async function callback(request: Request, p: LiveProvider): Promise<Response> {
  const url = new URL(request.url)
  const st = unseal<OAuthState>(OAUTH, parseCookies(request.headers.get('cookie'))[oauthCookieName(p)] ?? '')
  const origin = originOf(request)
  if (!st || st.p !== p || st.state !== url.searchParams.get('state')) {
    return redirect(withQuery(origin, st?.ret ?? '/', { connect_error: p, reason: 'state' }))
  }
  const back = (reason: string) => redirect(withQuery(origin, st.ret, { connect_error: p, reason }))
  const error = url.searchParams.get('error')
  // Google answers access_denied both when the user cancels and when the account is not a
  // registered test user of an app in Testing mode.
  if (error) return back(error === 'access_denied' ? 'access_denied' : 'error')
  const code = url.searchParams.get('code')
  if (!code) return back('error')

  let cred: Cred
  try {
    cred = await PROVIDERS[p].exchange({ code, redirectUri: callbackUri(request, p), verifier: st.verifier })
  } catch (e) {
    console.error(`[auth/${p}] exchange failed`, e instanceof Error ? e.message : e)
    return back(e instanceof NotConnectedError ? 'access_denied' : 'exchange')
  }

  if (st.desktop) {
    const q = new URLSearchParams({ provider: p, nonce: st.desktop.nonce, blob: sealCred(cred), account: accountName(cred) })
    return redirect(`http://127.0.0.1:${st.desktop.port}/yuiyumi-auth?${q}`)
  }
  return redirect(withQuery(origin, st.ret, { connected: p }), credCookie(request, cred))
}

async function logout(request: Request, p: LiveProvider): Promise<Response> {
  const cred = readCreds(request).creds[p]
  if (cred) await PROVIDERS[p].revoke(cred).catch(() => undefined)
  const res = json({ ok: true })
  res.headers.append('set-cookie', clearCredCookie(request, p))
  return res
}

/** api/auth/<provider>/<action>: start (GET), callback (GET), logout (POST). */
export async function handleAuthRoute(request: Request, p: LiveProvider): Promise<Response> {
  const action = new URL(request.url).pathname.split('/').filter(Boolean).at(-1)
  if (action === 'start' && request.method === 'GET') return start(request, p)
  if (action === 'callback' && request.method === 'GET') return callback(request, p)
  if (action === 'logout' && request.method === 'POST') return logout(request, p)
  return fail(404, 'not found', 'bad_request')
}
