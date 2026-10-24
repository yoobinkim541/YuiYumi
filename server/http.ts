import type { z } from 'zod'
import type { ApiError } from '../shared/contracts'

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export function fail(status: number, error: string, code?: ApiError['code']): Response {
  return json({ error, code } satisfies ApiError, status)
}

/** Parse a JSON body against a schema; returns a Response on failure. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown
  try { raw = await request.json() } catch { return fail(400, 'invalid json', 'bad_request') }
  const r = schema.safeParse(raw)
  if (!r.success) return fail(400, r.error.message, 'bad_request')
  return r.data
}

export function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

/** Provider or network failure. The client falls back to the mock data. */
export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) { super(message) }
}

/** User-facing refusal (unknown id, cap reached). Returned to the agent as the tool error. */
export class RejectedError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** The provider is not connected for this request, or its token was revoked or expired. */
export class NotConnectedError extends Error {}

/** Public origin of the app for OAuth redirect URIs. APP_ORIGIN overrides the request headers. */
export function originOf(request: Request): string {
  const fixed = env('APP_ORIGIN')
  if (fixed) return fixed.replace(/\/$/, '')
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? url.protocol.replace(/:$/, '')
  return `${proto}://${host}`
}

export function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  if (setCookie) headers.append('set-cookie', setCookie)
  return new Response(null, { status: 302, headers })
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (k && !(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** httpOnly, SameSite=Lax cookie; Secure on https. maxAge 0 clears it. */
export function cookie(name: string, value: string, opts: { maxAge: number, path?: string, secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? '/'}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ')
}

// --- CORS for the desktop app. Its webview origin is tauri://localhost (macOS) or
// http(s)://tauri.localhost (Windows); only these get CORS headers, the web app is same-origin.

const DESKTOP_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'])

export function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin')
  if (!origin || !DESKTOP_ORIGINS.has(origin)) return null
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-expose-headers': 'x-yuiyumi-session',
    'access-control-max-age': '600',
    'vary': 'Origin',
  }
}

/** OPTIONS handler: answers the desktop app's preflight. */
export async function preflight(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request) ?? { vary: 'Origin' } })
}

/** Adds the desktop CORS headers to a handler's responses. */
export function withCors(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request) => {
    const res = await handler(request)
    const cors = corsHeaders(request)
    if (!cors) return res
    const out = new Response(res.body, res)
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v)
    return out
  }
}
