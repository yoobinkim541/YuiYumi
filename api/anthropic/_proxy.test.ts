import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allowedModels, handleProxy, UsageMeter } from './_proxy.js'

const BASE = 'https://app.example/api/anthropic'
const saved = { ...process.env }

beforeEach(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.ANTHROPIC_API_KEY = 'sk-test-upstream'
  for (const k of ['MODEL_AGENT', 'MODEL_AGENT_OPUS', 'MODEL_OBSERVER']) delete process.env[k]
})
afterEach(() => { process.env = { ...saved } })

async function installToken(): Promise<string> {
  const res = await handleProxy(new Request(`${BASE}/install`, { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } }))
  expect(res.status).toBe(200)
  return (await res.json() as { token: string }).token
}

const messages = (token: string, body: Record<string, unknown>, path = '/v1/messages?beta=true') =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': token, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'claude-code-20250219', 'content-type': 'application/json', 'cookie': 'a=b' },
    body: JSON.stringify(body),
  })

describe('UsageMeter', () => {
  it('reads usage from message_start and message_delta across chunk splits', () => {
    const wire = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"cache_read_input_tokens":3000,"cache_creation_input_tokens":0,"output_tokens":1}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":42}}\n\n',
    ].join('')
    const m = new UsageMeter(true)
    for (let i = 0; i < wire.length; i += 17) m.feed(wire.slice(i, i + 17))
    expect(m.finish()).toEqual({ input_tokens: 12, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0, output_tokens: 42 })
  })

  it('reads usage from a JSON body', () => {
    const m = new UsageMeter(false)
    m.feed('{"usage":{"input_tokens":5,')
    m.feed('"output_tokens":7}}')
    expect(m.finish()).toEqual({ input_tokens: 5, output_tokens: 7 })
  })
})

describe('handleProxy', () => {
  it('rejects missing or forged install tokens, other paths, models and query params', async () => {
    const token = await installToken()
    const ok = { model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] }
    expect((await handleProxy(messages('nope', ok))).status).toBe(401)
    expect((await handleProxy(messages(token, ok, '/v1/models'))).status).toBe(404)
    expect((await handleProxy(messages(token, ok, '/v1/messages?foo=1'))).status).toBe(400)
    expect([...allowedModels()].sort()).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'])
    const bad = await handleProxy(messages(token, { ...ok, model: 'claude-fable-5-1' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ type: 'error', error: { type: 'invalid_request_error' } })
  })

  it('forwards with the server key only, clamps max_tokens and passes the stream through', async () => {
    const token = await installToken()
    let seen: { url: string, headers: Record<string, string>, body: Record<string, unknown> } | undefined
    const sse = 'data: {"type":"message_start","message":{"usage":{"input_tokens":3,"output_tokens":1}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n'
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_1', 'set-cookie': 'x=y' } })
    }) as unknown as typeof fetch

    const res = await handleProxy(messages(token, { model: 'claude-haiku-5-5', max_tokens: 999_999, stream: true, messages: [] }), fakeFetch)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(sse)
    expect(res.headers.get('request-id')).toBe('req_1')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(seen!.headers['x-api-key']).toBe('sk-test-upstream')
    expect(seen!.headers['anthropic-beta']).toBe('claude-code-20250219')
    expect(JSON.stringify(seen!.headers)).not.toContain(token)
    expect(seen!.headers).not.toHaveProperty('cookie')
    expect(seen!.body.max_tokens).toBe(64000)
  })

  it('stops an install at its daily cap without retry', async () => {
    process.env.BUDGET_INSTALL_DAILY_USD = '0.000001'
    const token = await installToken()
    const fakeFetch = (async () => new Response('{"usage":{"input_tokens":1000,"output_tokens":1000}}', { status: 200 })) as unknown as typeof fetch
    const first = await handleProxy(messages(token, { model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] }), fakeFetch)
    await first.text()
    const second = await handleProxy(messages(token, { model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] }), fakeFetch)
    expect(second.status).toBe(429)
    expect(second.headers.get('x-should-retry')).toBe('false')
  })
})
