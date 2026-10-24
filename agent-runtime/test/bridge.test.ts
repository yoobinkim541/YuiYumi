// Desktop bridge (src/desktop-app/agent-bridge.ts) against a fake runtime: transcript
// state, bus events for the character, permission answers, error lines.

import { describe, expect, it } from 'vitest'
import { AgentBridge, createAgentController } from '../../src/desktop-app/agent-bridge'
import { encodeSse, type AgentEvent } from '../src/protocol.ts'

function fakeRuntime(script: AgentEvent[], opts: { startStatus?: number } = {}) {
  const calls: { method: string, path: string, body?: unknown, token?: string }[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '')
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({ method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body as string) : undefined, token: headers['x-yuiyumi-agent-token'] })
    if (path.startsWith('/sessions/s1/events')) {
      // Split frames at odd places to exercise the parser.
      const wire = script.map((e, i) => encodeSse(i + 1, e)).join('')
      const enc = new TextEncoder()
      return new Response(new ReadableStream({
        start(c) {
          for (let i = 0; i < wire.length; i += 23) c.enqueue(enc.encode(wire.slice(i, i + 23)))
          c.close()
        },
      }), { status: 200 })
    }
    if (path === '/sessions' && opts.startStatus) {
      return new Response(JSON.stringify({ error: 'No project folder is set.', code: 'no_project' }), { status: opts.startStatus })
    }
    if (path === '/sessions') return new Response(JSON.stringify({ sessionId: 's1', cwd: '/work/p', model: 'claude-sonnet-5-5' }), { status: 200 })
    return new Response('{"ok":true}', { status: 200 })
  }) as unknown as typeof fetch
  return { calls, bridge: new AgentBridge({ port: 4321, token: 't'.repeat(32) }, fetchImpl) }
}

function controllerFor(script: AgentEvent[], opts: { startStatus?: number } = {}) {
  const { calls, bridge } = fakeRuntime(script, opts)
  const emitted: [string, unknown][] = []
  const c = createAgentController({
    bridge,
    lang: () => 'en',
    permission: () => 'manual',
    model: () => 'opus',
    projectDir: () => '/work/p',
    persona: () => ({ name: 'Yui' }),
    emit: (type, payload) => { emitted.push([type, payload]) },
  })
  return { c, calls, emitted }
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5))
  expect(cond()).toBe(true)
}

describe('agent bridge controller', () => {
  it('starts a task, builds the transcript and drives the character', async () => {
    const script: AgentEvent[] = [
      { type: 'user', text: 'make hello.txt' },
      { type: 'status', state: 'running' },
      { type: 'session', sessionId: 's1', cwd: '/work/p', model: 'claude-opus-5-5', tools: [] },
      { type: 'text', text: 'Writing it.', say: ['Creating the file.'] },
      { type: 'speak', phase: 'start', text: 'Creating the file.' },
      { type: 'tool_start', id: 'tu1', name: 'Write', grade: 'write', summary: 'hello.txt' },
      { type: 'permission', requestId: 'r1', toolUseId: 'tu1', tool: 'Write', grade: 'write', summary: 'hello.txt', expiresAt: Date.now() + 60_000 },
      { type: 'permission_resolved', requestId: 'r1', allow: true, reason: 'user' },
      { type: 'tool_end', id: 'tu1', ok: true, output: 'written' },
      { type: 'speak', phase: 'end', text: 'The file is ready.' },
      { type: 'result', ok: true, text: 'Created.', subtype: 'success', costUsd: 0.02, durationMs: 4000, turns: 2, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: 'status', state: 'idle' },
    ]
    const { c, calls, emitted } = controllerFor(script)
    await c.ask('make hello.txt')
    await until(() => c.state.items.some(i => i.kind === 'result') && !c.state.busy)

    const start = calls.find(x => x.path === '/sessions')!
    expect(start.body).toEqual({ text: 'make hello.txt', cwd: '/work/p', lang: 'en', permission: 'manual', model: 'opus', persona: { name: 'Yui' } })
    expect(start.token).toBe('t'.repeat(32))
    expect(c.state.items.map(i => i.kind)).toEqual(['user', 'text', 'tool', 'permission', 'result'])
    expect(c.state.items[2]).toMatchObject({ kind: 'tool', status: 'ok', output: 'written' })
    expect(c.state.items[3]).toMatchObject({ kind: 'permission', status: 'allowed' })
    expect(c.state.model).toBe('claude-opus-5-5')

    const reacts = emitted.filter(([t]) => t === 'character:react').map(([, p]) => p)
    expect(reacts).toEqual([
      { emotion: 'focused', line: 'Creating the file.', source: 'agent' },
      { emotion: 'curious', line: 'May I change this file?', source: 'agent' },
      { emotion: 'happy', line: 'The file is ready.', source: 'agent' },
    ])
    expect(emitted.filter(([t]) => t === 'agent:busy').map(([, p]) => p)).toEqual([{ busy: true }, { busy: false }])
    expect(emitted).toContainEqual(['thinking', { on: true }])
    expect(emitted[emitted.length - 1]).toEqual(['character:node', { node: 'idle' }])

    await c.answer('r1', true)
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/sessions/s1/permissions/r1', body: { allow: true } })
    c.dispose()
  })

  it('reports a missing project folder in the user\'s language and out loud', async () => {
    const { c, emitted } = controllerFor([], { startStatus: 400 })
    await c.ask('fix the tests')
    expect(c.state.items).toEqual([expect.objectContaining({ kind: 'error', code: 'no_project', text: 'Choose a project folder in settings first.' })])
    expect(c.state.busy).toBe(false)
    expect(emitted).toContainEqual(['character:react', { emotion: 'sorry', line: 'Choose a project folder in settings first.', source: 'agent' }])
  })
})
