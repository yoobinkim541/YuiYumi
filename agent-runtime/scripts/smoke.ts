// End-to-end smoke test against the real model (costs a few cents).
//   pnpm agent:smoke            ANTHROPIC_API_KEY from the environment, used directly
//   pnpm agent:smoke --proxy    through api/anthropic (served here on 127.0.0.1) with an
//                               install token, as the packaged desktop app would
//   --opus                      task model opus instead of sonnet
// Starts the runtime on a temp project, asks for hello.txt, answers every permission
// prompt with Allow, checks the file, then checks that the agent's shell cannot see the
// API key. Never prints the key.

import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config.ts'
import { SseParser, TOKEN_HEADER, type AgentEvent } from '../src/protocol.ts'
import { startServer } from '../src/server.ts'

const viaProxy = process.argv.includes('--proxy')
const smokeModel = process.argv.includes('--opus') ? 'opus' : 'sonnet'
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set')
  process.exit(2)
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'yy-agent-smoke-'))
const project = path.join(tmp, 'project')
const state = path.join(tmp, 'state')
await import('node:fs').then(fs => fs.mkdirSync(project, { recursive: true }))

const t0 = Date.now()
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
const proxied: string[] = []

// --- optional local proxy ---------------------------------------------------
let proxyUrl: string | undefined
let closeProxy = async () => {}
if (viaProxy) {
  process.env.AUTH_SECRET ??= randomBytes(32).toString('hex')
  // Untyped import: the web app's server code uses bundler-style imports (tsx resolves them).
  const proxyModule = '../../api/anthropic/_proxy.ts'
  const { handleProxy } = await import(proxyModule) as { handleProxy: (r: Request) => Promise<Response> }
  const srv = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) })
    const r = await handleProxy(request)
    let model = ''
    try { model = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: string }).model ?? '' } catch { /* install */ }
    proxied.push(`${req.url?.split('?')[0]} ${model} -> ${r.status}`)
    res.writeHead(r.status, Object.fromEntries(r.headers))
    if (r.body) for await (const c of r.body) res.write(c)
    res.end()
  })
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve))
  const port = (srv.address() as { port: number }).port
  proxyUrl = `http://127.0.0.1:${port}/api/anthropic`
  closeProxy = () => new Promise(resolve => { srv.closeAllConnections(); srv.close(() => resolve()) })
}

// --- runtime --------------------------------------------------------------------
const env: NodeJS.ProcessEnv = { ...process.env, YUIYUMI_AGENT_STATE_DIR: state, YUIYUMI_AGENT_PROJECT_DIR: project, YUIYUMI_AGENT_PERMISSION_TIMEOUT_MS: '60000' }
if (proxyUrl) env.YUIYUMI_AGENT_PROXY_URL = proxyUrl
const cfg = loadConfig(env, [])
const rt = await startServer(cfg)
const base = `http://127.0.0.1:${rt.port}`
const headers = { 'content-type': 'application/json', [TOKEN_HEADER]: cfg.token }
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<Record<string, unknown>>
}

console.log(`[smoke] runtime on 127.0.0.1:${rt.port}, ${viaProxy ? 'via local proxy' : 'direct key'}, model ${cfg.models[smokeModel]}, project ${project}`)
const { sessionId } = await post('/sessions', {
  text: 'Create a file named hello.txt in the current folder whose entire content is: hi',
  permission: 'manual',
  model: smokeModel,
  lang: 'en',
  persona: { name: 'Yui' },
}) as { sessionId: string }

type Result = Extract<AgentEvent, { type: 'result' }>
const results: Result[] = []
const toolOutputs: string[] = []
let firstSpeakMs = 0
const stream = await fetch(`${base}/sessions/${sessionId}/events`, { headers })
const reader = stream.body!.getReader()
const decoder = new TextDecoder()
const parser = new SseParser()

async function untilResults(n: number, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs
  while (results.length < n) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the result')
    const { value, done } = await reader.read()
    if (done) throw new Error('event stream ended early')
    for (const { event: e } of parser.feed(decoder.decode(value, { stream: true }))) {
      switch (e.type) {
        case 'permission':
          console.log(`[smoke] ${at()} permission ${e.tool} (${e.grade}): ${e.summary} -> allow`)
          await post(`/sessions/${sessionId}/permissions/${e.requestId}`, { allow: true })
          break
        case 'speak':
          if (!firstSpeakMs) firstSpeakMs = Date.now() - t0
          console.log(`[smoke] ${at()} speak/${e.phase}: ${e.text}`)
          break
        case 'tool_start': console.log(`[smoke] ${at()} tool ${e.name}: ${e.summary}`); break
        case 'tool_end': if (e.output) toolOutputs.push(e.output); console.log(`[smoke] ${at()} tool done ok=${e.ok}`); break
        case 'text': if (e.text) console.log(`[smoke] ${at()} text: ${e.text.slice(0, 160).replace(/\n/g, ' ')}`); break
        case 'session': console.log(`[smoke] ${at()} session model=${e.model} tools=${e.tools.length}`); break
        case 'notice': console.log(`[smoke] ${at()} notice: ${e.text}`); break
        case 'error': console.log(`[smoke] ${at()} error ${e.code}: ${e.message}`); break
        case 'result': results.push(e); console.log(`[smoke] ${at()} result ok=${e.ok} subtype=${e.subtype}`); break
        default:
      }
    }
  }
}

let failed = false
try {
  await untilResults(1)
  const firstMs = Date.now() - t0
  let content = ''
  try { content = readFileSync(path.join(project, 'hello.txt'), 'utf8') } catch { /* missing */ }
  const fileOk = content.trim() === 'hi'
  console.log(`[smoke] hello.txt ${fileOk ? 'OK' : `MISSING or wrong (${JSON.stringify(content.slice(0, 40))})`}`)
  failed ||= !fileOk || !results[0]!.ok

  // Follow-up in the same session: can the agent's shell see the key?
  await post(`/sessions/${sessionId}/messages`, {
    text: 'Run this shell command and tell me which single word it printed: sh -c \'if [ -n "$ANTHROPIC_API_KEY" ]; then echo KEY_VISIBLE; else echo KEY_HIDDEN; fi\'',
  })
  await untilResults(2)
  const all = toolOutputs.join('\n')
  const scrub = all.includes('KEY_HIDDEN') ? 'hidden' : all.includes('KEY_VISIBLE') ? 'VISIBLE' : 'unknown (command not run)'
  console.log(`[smoke] API key in the agent's shell: ${scrub}`)
  failed ||= scrub === 'VISIBLE'

  const r = results[results.length - 1]!
  console.log(`[smoke] first task: ${(firstMs / 1000).toFixed(1)}s (first spoken line at ${(firstSpeakMs / 1000).toFixed(1)}s)`)
  console.log(`[smoke] session total: ${((Date.now() - t0) / 1000).toFixed(1)}s, cost ~$${r.costUsd.toFixed(4)} (SDK estimate), turns ${r.turns}, tokens in/out ${r.usage.inputTokens}/${r.usage.outputTokens}, cache read/write ${r.usage.cacheReadTokens}/${r.usage.cacheWriteTokens}`)
  if (proxied.length) console.log(`[smoke] proxied calls:\n  ${[...new Set(proxied)].join('\n  ')}`)
} catch (e) {
  failed = true
  console.error(`[smoke] FAILED: ${(e as Error).message}`)
} finally {
  await reader.cancel().catch(() => {})
  await rt.close()
  await closeProxy()
  rmSync(tmp, { recursive: true, force: true })
}
console.log(failed ? '[smoke] FAIL' : '[smoke] PASS')
process.exit(failed ? 1 : 0)
