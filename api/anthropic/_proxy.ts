// Messages API proxy for the desktop agent runtime. The runtime's Claude Code process uses
// ANTHROPIC_BASE_URL=<origin>/api/anthropic with a per-install token as its API key; this
// swaps the token for our ANTHROPIC_API_KEY. Only the Messages endpoints and allowed model
// ids pass, under the per-install and daily caps in server/budget.ts. The key never leaves
// the server and is never logged. (Underscore file: a helper, not a Vercel function.)

import { randomUUID } from 'node:crypto'
import { MODELS } from '../../server/anthropic.js'
import { admitCount, admitInstall, recordInstall, type ProxyUsage } from '../../server/budget.js'
import { env } from '../../server/http.js'
import { seal, sealConfigured, unseal } from '../../server/seal.js'

const UPSTREAM = 'https://api.anthropic.com'
const PREFIX = '/api/anthropic'
const PATHS = new Set(['/v1/messages', '/v1/messages/count_tokens'])
const INSTALL_PURPOSE = 'agent-install'
const INSTALL_TTL = 60 * 60 * 24 * 90
const MAX_BODY = 4 * 1024 * 1024
const PASS_UP = ['anthropic-version', 'anthropic-beta']
const PASS_DOWN = ['content-type', 'request-id', 'retry-after', 'x-should-retry']

/** The two task models the user can pick, plus Haiku for Claude Code's internal calls. */
export const allowedModels = (): Set<string> => new Set([MODELS.agent('sonnet'), MODELS.agent('opus'), MODELS.observer()])

/** Anthropic-shaped error, so the SDK in the runtime reports it as an API error. */
function apiError(status: number, type: string, message: string, retry = false): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-should-retry': String(retry) },
  })
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

/** The install id from `x-api-key` or `Authorization: Bearer`, or null. */
export function installIdOf(request: Request): string | null {
  const raw = request.headers.get('x-api-key') ?? /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!raw) return null
  const d = unseal<{ i?: string }>(INSTALL_PURPOSE, raw.trim())
  return d && typeof d.i === 'string' ? d.i : null
}

// ---------------------------------------------------------------------------
// Usage metering of the upstream response (SSE stream or JSON body).

export class UsageMeter {
  readonly usage: ProxyUsage = {}
  private buf = ''
  private json = ''
  private readonly streaming: boolean

  constructor(streaming: boolean) { this.streaming = streaming }

  feed(text: string): void {
    if (!this.streaming) { this.json += text; return }
    this.buf += text
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, '')
      this.buf = this.buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      try {
        const ev = JSON.parse(line.slice(5).trim()) as { type?: string, message?: { usage?: ProxyUsage }, usage?: ProxyUsage }
        if (ev.type === 'message_start') this.merge(ev.message?.usage)
        else if (ev.type === 'message_delta') this.merge(ev.usage)
      } catch { /* not JSON: ignore */ }
    }
  }

  /** Call when the body ended (or was cut off). */
  finish(): ProxyUsage {
    if (!this.streaming && this.json) {
      try { this.merge((JSON.parse(this.json) as { usage?: ProxyUsage }).usage) } catch { /* error body */ }
      this.json = ''
    }
    return this.usage
  }

  private merge(u: ProxyUsage | undefined): void {
    if (!u) return
    for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as const) {
      const v = u[k]
      if (typeof v === 'number') this.usage[k] = v
    }
  }
}

/** Passes the upstream body through unchanged and records its usage when it ends. */
function metered(body: ReadableStream<Uint8Array>, meter: UsageMeter, done: (u: ProxyUsage) => void): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let recorded = false
  const end = () => { if (!recorded) { recorded = true; done(meter.finish()) } }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done: finished } = await reader.read()
        if (finished) { end(); controller.close(); return }
        meter.feed(decoder.decode(value, { stream: true }))
        controller.enqueue(value)
      } catch (e) {
        end()
        controller.error(e)
      }
    },
    async cancel(reason) {
      end()
      await reader.cancel(reason)
    },
  })
}

// ---------------------------------------------------------------------------
// Handlers

/** POST /api/anthropic/install -> { token }: a fresh per-install token. */
async function mintInstall(request: Request): Promise<Response> {
  if (!sealConfigured()) return apiError(503, 'api_error', 'agent proxy not configured')
  const cap = Number(env('AGENT_INSTALLS_PER_IP_DAILY') ?? 10)
  if (!admitCount(`agent-install:${clientIp(request)}`, cap)) return apiError(429, 'rate_limit_error', 'too many installs from this address today')
  const token = seal(INSTALL_PURPOSE, { i: randomUUID() }, INSTALL_TTL)
  return new Response(JSON.stringify({ token }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

export async function handleProxy(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  const sub = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname
  if (request.method !== 'POST') return apiError(405, 'invalid_request_error', 'method not allowed')
  if (sub === '/install') return mintInstall(request)
  if (!PATHS.has(sub)) return apiError(404, 'not_found_error', 'only the Messages endpoints are available')
  // Only ?beta=... goes upstream. Other parameters are dropped: the platform's rewrite adds its
  // own route parameters, so rejecting unknown ones would refuse every request.
  const beta = url.searchParams.get('beta')
  const search = beta === null ? '' : `?beta=${encodeURIComponent(beta)}`

  const key = env('ANTHROPIC_API_KEY')
  if (!key || !sealConfigured()) return apiError(503, 'api_error', 'agent proxy not configured')
  const installId = installIdOf(request)
  if (!installId) return apiError(401, 'authentication_error', 'invalid install token')

  const text = await request.text()
  if (text.length > MAX_BODY) return apiError(413, 'request_too_large', 'request too large for the proxy')
  let body: { model?: unknown, max_tokens?: unknown, stream?: unknown }
  try { body = JSON.parse(text) as typeof body } catch { return apiError(400, 'invalid_request_error', 'invalid json') }
  const model = typeof body.model === 'string' ? body.model : ''
  if (!allowedModels().has(model)) return apiError(400, 'invalid_request_error', `model not allowed: ${model.slice(0, 60)}`)
  if (!admitInstall(installId)) return apiError(429, 'rate_limit_error', 'YuiYumi agent budget reached for today', false)

  const maxTokens = Number(env('AGENT_PROXY_MAX_TOKENS') ?? 64000)
  let outBody = text
  if (typeof body.max_tokens === 'number' && body.max_tokens > maxTokens) outBody = JSON.stringify({ ...body, max_tokens: maxTokens })

  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': key }
  for (const h of PASS_UP) {
    const v = request.headers.get(h)
    if (v) headers[h] = v
  }
  headers['anthropic-version'] ??= '2023-06-01'

  let upstream: Response
  try {
    upstream = await fetchImpl(`${UPSTREAM}${sub}${search}`, { method: 'POST', headers, body: outBody, signal: request.signal })
  } catch (e) {
    console.error('[api/anthropic] upstream fetch failed', (e as Error).name)
    return apiError(502, 'api_error', 'upstream unavailable', true)
  }

  const down = new Headers({ 'cache-control': 'no-store' })
  for (const h of PASS_DOWN) {
    const v = upstream.headers.get(h)
    if (v) down.set(h, v)
  }
  // count_tokens is free; only Messages calls are metered.
  if (!upstream.body || sub !== '/v1/messages' || !upstream.ok) {
    if (!upstream.ok) console.error('[api/anthropic] upstream status', upstream.status)
    return new Response(upstream.body, { status: upstream.status, headers: down })
  }
  const meter = new UsageMeter(body.stream === true)
  return new Response(metered(upstream.body, meter, u => recordInstall(installId, model, u)), { status: upstream.status, headers: down })
}
