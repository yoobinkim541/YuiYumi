import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStatus, handleAuthRoute, readCreds, sealCred } from './auth.js'
import { seal, unseal } from './seal.js'

const ORIGIN = 'http://localhost:5180'

function req(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  headers.set('host', 'localhost:5180')
  if (init.cookie) headers.set('cookie', init.cookie)
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

/** "name=value" of a Set-Cookie header. */
const cookiePair = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(40))
  vi.stubEnv('GOOGLE_CLIENT_ID', 'gid')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret')
  vi.stubEnv('APP_ORIGIN', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sealed blobs', () => {
  it('round-trips, binds the purpose and rejects tampering or expiry', () => {
    const blob = seal('session', { a: 1 }, 60)
    expect(unseal('session', blob)).toEqual({ a: 1 })
    expect(unseal('oauth', blob)).toBeNull()
    const bytes = Buffer.from(blob, 'base64url')
    bytes[20] = bytes[20]! ^ 1
    expect(unseal('session', bytes.toString('base64url'))).toBeNull()
    expect(unseal('session', seal('session', { a: 1 }, 1, 0))).toBeNull()
  })

  it('reads credentials from cookies and from a desktop bearer header', () => {
    const g = sealCred({ p: 'google', rt: 'r', email: 'me@example.com', gm: true, cal: false })
    const s = sealCred({ p: 'slack', token: 'xoxp', team: 'Acme', teamId: 'T1', user: 'U1' })
    const viaCookie = readCreds(req('/', { cookie: `yy_google=${g}; other=1` }))
    expect(viaCookie.creds.google?.email).toBe('me@example.com')
    expect(viaCookie.fromCookie.has('google')).toBe(true)
    const viaBearer = readCreds(req('/', { headers: { authorization: `Bearer ${g},${s}` } }))
    expect(Object.keys(viaBearer.creds).sort()).toEqual(['google', 'slack'])
    expect(viaBearer.fromCookie.size).toBe(0)
    expect(readCreds(req('/', { cookie: 'yy_google=garbage' })).creds).toEqual({})
  })
})

describe('status', () => {
  it('reports availability, the account name and granted services only', () => {
    const g = sealCred({ p: 'google', rt: 'secret-refresh', at: 'secret-access', email: 'me@example.com', gm: true, cal: false })
    const st = authStatus(req('/api/auth/status', { cookie: `yy_google=${g}` }))
    expect(st.providers.google).toEqual({ available: true, connected: true, account: 'me@example.com', services: ['mail'] })
    expect(st.providers.slack).toEqual({ available: false, connected: false, services: [] })
    expect(JSON.stringify(st)).not.toContain('secret')
    vi.stubEnv('AUTH_SECRET', '')
    expect(authStatus(req('/api/auth/status')).providers.google.available).toBe(false)
  })
})

describe('Google OAuth routes', () => {
  it('start redirects to consent with PKCE, offline access and a state cookie on the callback path', async () => {
    const res = await handleAuthRoute(req('/api/auth/google/start?return=/app'), 'google')
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin).toBe('https://accounts.google.com')
    expect(loc.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/google/callback`)
    expect(loc.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events')
    expect(loc.searchParams.get('access_type')).toBe('offline')
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256')
    const set = res.headers.get('set-cookie')!
    expect(set).toContain('Path=/api/auth/google/callback')
    expect(set).toContain('HttpOnly')
    expect(set).not.toContain('Secure') // http://localhost
  })

  it('callback checks the state, exchanges the code and sets the sealed cookie', async () => {
    const start = await handleAuthRoute(req('/api/auth/google/start?return=/app'), 'google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const oauth = cookiePair(start)

    const bad = await handleAuthRoute(req(`/api/auth/google/callback?state=nope&code=c`, { cookie: oauth }), 'google')
    expect(bad.headers.get('location')).toBe('/app?connect_error=google&reason=state')

    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        bodies.push(String(init?.body))
        return Response.json({ access_token: 'at', refresh_token: 'refresh-token-value', expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events' })
      }
      if (url.endsWith('/users/me/profile')) return Response.json({ emailAddress: 'judge@example.com' })
      return new Response('{}', { status: 404 })
    }))
    const ok = await handleAuthRoute(req(`/api/auth/google/callback?state=${state}&code=c0de`, { cookie: oauth }), 'google')
    expect(ok.headers.get('location')).toBe('/app?connected=google')
    expect(bodies[0]).toContain('code_verifier=')
    expect(bodies[0]).toContain('client_secret=gsecret')
    const session = cookiePair(ok)
    expect(session.startsWith('yy_google=')).toBe(true)
    expect(session).not.toContain('refresh-token-value')
    const st = authStatus(req('/api/auth/status', { cookie: session }))
    expect(st.providers.google).toMatchObject({ connected: true, account: 'judge@example.com', services: ['mail', 'calendar'] })
  })

  it('maps access_denied (cancelled, or not a test user) to its own reason', async () => {
    const start = await handleAuthRoute(req('/api/auth/google/start'), 'google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await handleAuthRoute(req(`/api/auth/google/callback?state=${state}&error=access_denied`, { cookie: cookiePair(start) }), 'google')
    expect(res.headers.get('location')).toBe('/?connect_error=google&reason=access_denied')
  })

  it('refuses open redirects and unconfigured providers', async () => {
    const res = await handleAuthRoute(req('/api/auth/slack/start?return=//evil.example'), 'slack')
    expect(res.headers.get('location')).toBe('/?connect_error=slack&reason=unavailable')
  })

  it('desktop login finishes on the 127.0.0.1 loopback with the sealed blob', async () => {
    const start = await handleAuthRoute(req('/api/auth/google/start?client=desktop&port=48123&nonce=abcdefgh12'), 'google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/token')
      ? Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events' })
      : Response.json({ summary: 'judge@example.com' }))))
    const res = await handleAuthRoute(req(`/api/auth/google/callback?state=${state}&code=c`, { cookie: cookiePair(start) }), 'google')
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin).toBe('http://127.0.0.1:48123')
    expect(loc.searchParams.get('nonce')).toBe('abcdefgh12')
    expect(res.headers.get('set-cookie')).toBeNull()
    const st = authStatus(req('/', { headers: { authorization: `Bearer ${loc.searchParams.get('blob')}` } }))
    expect(st.providers.google).toMatchObject({ connected: true, account: 'judge@example.com', services: ['calendar'] })
  })

  it('logout revokes the token and clears the cookie', async () => {
    const g = sealCred({ p: 'google', rt: 'r', email: 'me@example.com', gm: true, cal: true })
    const f = vi.fn(async (_url: string) => new Response('{}'))
    vi.stubGlobal('fetch', f)
    const res = await handleAuthRoute(req('/api/auth/google/logout', { method: 'POST', cookie: `yy_google=${g}` }), 'google')
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(String(f.mock.calls[0]?.[0])).toContain('https://oauth2.googleapis.com/revoke')
  })
})
