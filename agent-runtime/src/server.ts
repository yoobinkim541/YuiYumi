// Local HTTP server on 127.0.0.1: task start, follow-ups, permission answers, cancel, and
// the per-session SSE event stream. Every route except /health needs the launch token.

import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { forgetInstallToken, resolveCredentials, resolveProjectDir, type RuntimeConfig } from './config.ts'
import { encodeSse, TOKEN_HEADER, type AgentErrorCode } from './protocol.ts'
import { AgentSession, type SessionInit } from './session.ts'

const TAURI_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']
const MAX_BODY = 256 * 1024
const IDLE_CLOSE_MS = 60 * 60 * 1000
const KEEPALIVE_MS = 15_000

const Lang = z.enum(['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'])
const Level = z.enum(['manual', 'auto', 'bypass'])
const Model = z.enum(['sonnet', 'opus'])
const StartSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  cwd: z.string().max(4096).optional(),
  lang: Lang.optional(),
  persona: z.object({ name: z.string().max(40), speakingStyle: z.string().max(400).optional() }).optional(),
  permission: Level.optional(),
  model: Model.optional(),
  resume: z.string().uuid().optional(),
})
const FollowUpSchema = z.object({ text: z.string().trim().min(1).max(20_000) })
const AnswerSchema = z.object({ allow: z.boolean() })
const SettingsSchema = z.object({ permission: Level.optional(), model: Model.optional() })

class HttpError extends Error {
  readonly status: number
  readonly code: AgentErrorCode
  constructor(status: number, code: AgentErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface RuntimeServer {
  server: Server
  port: number
  sessions: Map<string, AgentSession>
  close(): Promise<void>
}

export async function startServer(cfg: RuntimeConfig, opts: { queryFn?: SessionInit['queryFn'] } = {}): Promise<RuntimeServer> {
  const sessions = new Map<string, AgentSession>()
  const origins = new Set([...TAURI_ORIGINS, ...cfg.origins])
  const token = Buffer.from(cfg.token)
  let port = cfg.port

  const authorized = (req: IncomingMessage) => {
    const got = Buffer.from(String(req.headers[TOKEN_HEADER] ?? ''))
    return got.length === token.length && timingSafeEqual(got, token)
  }

  /** Blocks DNS rebinding (foreign Host) and pages from other origins. */
  const allowedRequest = (req: IncomingMessage) => {
    const host = String(req.headers.host ?? '')
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false
    const origin = req.headers.origin
    return !origin || origins.has(origin)
  }

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin
    if (!origin || !origins.has(origin)) return
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('access-control-allow-headers', `content-type, ${TOKEN_HEADER}, last-event-id`)
    res.setHeader('access-control-max-age', '600')
    res.setHeader('vary', 'Origin')
  }

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const readJson = async <S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> => {
    let size = 0
    const chunks: Buffer[] = []
    for await (const c of req) {
      size += (c as Buffer).length
      if (size > MAX_BODY) throw new HttpError(413, 'bad_request', 'body too large')
      chunks.push(c as Buffer)
    }
    let raw: unknown
    try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw new HttpError(400, 'bad_request', 'invalid json') }
    const r = schema.safeParse(raw)
    if (!r.success) throw new HttpError(400, 'bad_request', r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
    return r.data
  }

  const session = (id: string) => {
    const s = sessions.get(id)
    if (!s) throw new HttpError(404, 'not_found', 'unknown session')
    return s
  }

  async function startTask(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req, StartSchema)
    const project = resolveProjectDir(body.cwd, cfg)
    if (!project.ok) throw new HttpError(400, 'no_project', project.message)
    if (body.resume) sessions.get(body.resume)?.close()
    let cred
    try { cred = await resolveCredentials(cfg) } catch (e) {
      throw new HttpError(502, 'unconfigured', `model proxy unavailable: ${(e as Error).message}`)
    }
    if (!cred) throw new HttpError(503, 'unconfigured', 'No model access: set YUIYUMI_AGENT_PROXY_URL, or ANTHROPIC_API_KEY for development.')
    const s = new AgentSession({
      cfg,
      cred,
      cwd: project.dir,
      lang: body.lang ?? 'en',
      persona: body.persona,
      permission: body.permission ?? cfg.defaultPermission,
      model: body.model ?? 'sonnet',
      resume: body.resume,
      onAuthFailure: () => { if (cred.mode === 'proxy' && !cfg.installToken) forgetInstallToken(cfg) },
      queryFn: opts.queryFn,
    })
    sessions.set(s.id, s)
    s.start(body.text)
    send(res, 200, { sessionId: s.id, cwd: s.cwd, model: s.model })
  }

  function streamEvents(req: IncomingMessage, res: ServerResponse, s: AgentSession, url: URL) {
    const after = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0) || 0
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write(': connected\n\n')
    const off = s.subscribe(after, (e) => {
      res.write(encodeSse(e.seq, e.event))
      if (e.event.type === 'status' && e.event.state === 'closed') res.end()
    })
    if (s.state === 'closed') res.end()
    const ping = setInterval(() => res.write(': ping\n\n'), KEEPALIVE_MS)
    res.on('close', () => { clearInterval(ping); off() })
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    const parts = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    if (method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, version: '0.1.0' })
    if (!authorized(req)) throw new HttpError(401, 'unauthorized', 'missing or wrong token')

    if (parts[0] !== 'sessions') throw new HttpError(404, 'not_found', 'no such route')
    if (parts.length === 1 && method === 'POST') return startTask(req, res)
    if (parts.length === 1 && method === 'GET') {
      return send(res, 200, { sessions: [...sessions.values()].map(s => ({ id: s.id, cwd: s.cwd, state: s.state, permission: s.level, model: s.model })) })
    }
    const s = session(parts[1]!)
    const action = parts[2]
    if (!action && method === 'DELETE') { s.close(); sessions.delete(s.id); return send(res, 200, { ok: true }) }
    if (action === 'events' && method === 'GET') return streamEvents(req, res, s, url)
    if (action === 'messages' && method === 'POST') {
      const { text } = await readJson(req, FollowUpSchema)
      if (s.state === 'closed') throw new HttpError(409, 'bad_request', 'session is closed; start a new one with resume')
      s.send(text)
      return send(res, 200, { ok: true })
    }
    if (action === 'cancel' && method === 'POST') { await s.cancel(); return send(res, 200, { ok: true }) }
    if (action === 'settings' && method === 'POST') {
      const { permission, model } = await readJson(req, SettingsSchema)
      if (permission) s.setPermission(permission)
      if (model) await s.setModel(model)
      return send(res, 200, { ok: true })
    }
    if (action === 'permissions' && parts[3] && method === 'POST') {
      const { allow } = await readJson(req, AnswerSchema)
      if (!s.answer(parts[3], allow)) throw new HttpError(404, 'not_found', 'no pending permission request with that id')
      return send(res, 200, { ok: true })
    }
    throw new HttpError(404, 'not_found', 'no such route')
  }

  const server = createServer((req, res) => {
    if (!allowedRequest(req)) return send(res, 403, { error: 'forbidden', code: 'unauthorized' })
    cors(req, res)
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    route(req, res).catch((e: unknown) => {
      const err = e instanceof HttpError ? e : new HttpError(500, 'internal', 'internal error')
      if (!(e instanceof HttpError)) console.error('[agent-runtime]', (e as Error).message)
      if (!res.headersSent) send(res, err.status, { error: err.message, code: err.code })
      else res.end()
    })
  })

  // Idle sessions keep a Claude Code process alive: close them after an hour.
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const s of sessions.values()) {
      if (s.state !== 'running' && now - s.lastActivity > IDLE_CLOSE_MS) { s.close(); sessions.delete(s.id) }
    }
  }, 60_000)
  sweeper.unref()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(cfg.port, cfg.host, () => resolve())
  })
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : cfg.port

  return {
    server,
    port,
    sessions,
    async close() {
      clearInterval(sweeper)
      for (const s of sessions.values()) s.close()
      sessions.clear()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
