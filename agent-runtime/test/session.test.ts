import type { Options, PermissionResult, Query, SDKMessage, SDKUserMessage, query } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import type { AgentEvent } from '../src/protocol.ts'
import { AgentSession } from '../src/session.ts'

const msg = (m: unknown) => m as SDKMessage

/** Scripted stand-in for the SDK: one Write call per user message, gated by canUseTool. */
function fakeQuery(decisions: PermissionResult[], seen: { options?: Options, interrupted: boolean, model?: string }) {
  return ((params: { prompt: AsyncIterable<SDKUserMessage>, options?: Options }) => {
    seen.options = params.options
    async function* run(): AsyncGenerator<SDKMessage> {
      yield msg({ type: 'system', subtype: 'init', cwd: params.options!.cwd, model: 'claude-sonnet-5-5', tools: ['Read', 'Write'] })
      for await (const user of params.prompt) {
        void user
        yield msg({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'SAY: Creating the file.\nWriting it now.' }] } })
        yield msg({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Write', input: { file_path: `${params.options!.cwd}/hello.txt`, content: 'hi' } }] } })
        const d = await params.options!.canUseTool!('Write', { file_path: 'hello.txt' }, { signal: new AbortController().signal, toolUseID: 'tu1', requestId: 'r1' })
        decisions.push(d!)
        yield msg({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: d!.behavior === 'allow' ? 'written' : 'denied', is_error: d!.behavior !== 'allow' }] } })
        yield msg({ type: 'result', subtype: 'success', is_error: false, result: 'Created hello.txt.\nSAY: The file is ready.', total_cost_usd: 0.01, duration_ms: 1200, num_turns: 2, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } })
      }
    }
    return Object.assign(run(), { interrupt: async () => { seen.interrupted = true }, setModel: async (m?: string) => { seen.model = m } }) as unknown as Query
  }) as unknown as typeof query
}

function makeSession(timeoutMs: number, level: 'manual' | 'auto' = 'manual') {
  const cfg = loadConfig({ YUIYUMI_AGENT_STATE_DIR: '/tmp/yy-agent-test', YUIYUMI_AGENT_PERMISSION_TIMEOUT_MS: String(timeoutMs) }, [])
  const decisions: PermissionResult[] = []
  const seen = { interrupted: false } as { options?: Options, interrupted: boolean, model?: string }
  const s = new AgentSession({ cfg, cred: { mode: 'direct', apiKey: 'test-key' }, cwd: '/work/project', lang: 'ja', persona: { name: 'Yumi' }, permission: level, model: 'sonnet', queryFn: fakeQuery(decisions, seen) })
  const events: AgentEvent[] = []
  return { s, events, decisions, seen }
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5))
  expect(cond()).toBe(true)
}

describe('AgentSession', () => {
  it('streams text, tools, a permission round trip and spoken start/end lines', async () => {
    const { s, events, decisions, seen } = makeSession(10_000)
    s.subscribe(0, (e) => {
      events.push(e.event)
      if (e.event.type === 'permission') s.answer(e.event.requestId, true)
    })
    s.start('make hello.txt')
    await until(() => s.state === 'idle')

    expect(events.map(e => e.type)).toEqual(['user', 'status', 'session', 'text', 'speak', 'tool_start', 'permission', 'permission_resolved', 'tool_end', 'speak', 'result', 'status'])
    expect(events).toContainEqual({ type: 'speak', phase: 'start', text: 'Creating the file.' })
    expect(events).toContainEqual({ type: 'speak', phase: 'end', text: 'The file is ready.' })
    expect(events).toContainEqual({ type: 'text', text: 'Writing it now.', say: ['Creating the file.'] })
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_start', name: 'Write', grade: 'write', summary: 'hello.txt' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'result', ok: true, text: 'Created hello.txt.', costUsd: 0.01 }))
    expect(decisions[0]).toMatchObject({ behavior: 'allow' })

    // SDK options: preset prompt with our appendix, isolated settings, curated env.
    const o = seen.options!
    expect(o.systemPrompt).toMatchObject({ type: 'preset', preset: 'claude_code' })
    expect((o.systemPrompt as { append: string }).append).toContain('in Japanese, in the voice of Yumi')
    expect(o.settingSources).toEqual([])
    expect(o.permissionMode).toBe('default')
    expect(o.sessionId).toBe(s.id)
    expect(o.model).toBe('claude-sonnet-5-5')
    expect(o.env?.CLAUDE_CODE_SUBAGENT_MODEL).toBe('claude-sonnet-5-5')
    expect(o.env?.ANTHROPIC_SMALL_FAST_MODEL).toBe('claude-haiku-5-5')
    expect(o.env?.ANTHROPIC_API_KEY).toBe('test-key')
    expect(o.env?.CLAUDE_CONFIG_DIR).toBe('/tmp/yy-agent-test/claude')
    s.close()
  })

  it('a one-message answer is spoken once, as the end line', () => {
    const { s, events } = makeSession(10_000)
    s.subscribe(0, e => events.push(e.event))
    s.send('what is in this folder?')
    s.handle(msg({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Two files.\nSAY: There are two files here.' }] } }))
    s.handle(msg({ type: 'result', subtype: 'success', is_error: false, result: 'Two files.\nSAY: There are two files here.', total_cost_usd: 0, duration_ms: 1, num_turns: 1, usage: {} }))
    expect(events.filter(e => e.type === 'speak')).toEqual([{ type: 'speak', phase: 'end', text: 'There are two files here.' }])
  })

  it('switches the model of a running session', async () => {
    const { s, seen } = makeSession(10_000)
    s.subscribe(0, (e) => { if (e.event.type === 'permission') s.answer(e.event.requestId, true) })
    s.start('make hello.txt')
    await s.setModel('opus')
    expect(seen.model).toBe('claude-opus-5-5')
    expect(s.model).toBe('claude-opus-5-5')
    s.close()
  })

  it('denies when the user does not answer in time', async () => {
    const { s, events, decisions } = makeSession(20)
    s.subscribe(0, e => events.push(e.event))
    s.start('make hello.txt')
    await until(() => s.state === 'idle')
    expect(events).toContainEqual(expect.objectContaining({ type: 'permission_resolved', allow: false, reason: 'timeout' }))
    expect(decisions[0]).toMatchObject({ behavior: 'deny' })
    expect((decisions[0] as { message: string }).message).toMatch(/did not answer/)
    expect(events).toContainEqual({ type: 'tool_end', id: 'tu1', ok: false, output: 'denied' })
    s.close()
  })

  it('auto level writes inside the project without asking', async () => {
    const { s, events, decisions } = makeSession(10_000, 'auto')
    s.subscribe(0, e => events.push(e.event))
    s.start('make hello.txt')
    await until(() => s.state === 'idle')
    expect(events.some(e => e.type === 'permission')).toBe(false)
    expect(decisions[0]).toMatchObject({ behavior: 'allow' })
    s.close()
  })

  it('cancel denies the open prompt and interrupts; follow-ups reuse the session', async () => {
    const { s, events, decisions, seen } = makeSession(10_000)
    let asked = ''
    s.subscribe(0, (e) => { events.push(e.event); if (e.event.type === 'permission') asked = e.event.requestId })
    s.start('make hello.txt')
    await until(() => asked !== '')
    await s.cancel()
    expect(seen.interrupted).toBe(true)
    await until(() => s.state === 'idle')
    expect(decisions[0]).toMatchObject({ behavior: 'deny' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'result', ok: false, subtype: 'cancelled' }))

    s.send('try again')
    await until(() => decisions.length === 1 && events.filter(e => e.type === 'permission').length === 2)
    const second = events.filter(e => e.type === 'permission')[1] as { requestId: string }
    expect(s.answer(second.requestId, true)).toBe(true)
    expect(s.answer(second.requestId, true)).toBe(false)
    await until(() => s.state === 'idle' && decisions.length === 2)
    expect(events.filter(e => e.type === 'user').map(e => (e as { text: string }).text)).toEqual(['make hello.txt', 'try again'])
    s.close()
    expect(s.state).toBe('closed')
  })
})
