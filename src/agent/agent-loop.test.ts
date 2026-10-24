import { describe, expect, it, vi } from 'vitest'
import type { AgentStepRequest, PermissionLevel } from '@shared/contracts'
import type { ToolOutcome } from '@/connectors/registry'
import { createStepClient, DECLINED_RESULT, handleDelegate, splitForSpeech, type AgentDeps } from './agent-loop'
import type { ConfirmCardInput } from './confirm-queue'
import { AGENT_STRINGS } from './strings'

type Reply = { status?: number, body: unknown }

/** Fake fetch that returns scripted /api/agent replies and records request bodies. */
function fakeFetch(replies: Reply[]) {
  const bodies: AgentStepRequest[] = []
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    // Snapshot: the loop keeps mutating its messages array after the call.
    bodies.push(JSON.parse(String(init?.body)) as AgentStepRequest)
    const r = replies.shift()
    if (!r) throw new Error('no more scripted replies')
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  })
  return { fetch: fn as unknown as typeof fetch, bodies, fn }
}

function makeDeps(f: typeof fetch, opts: { confirm?: (c: ConfirmCardInput) => Promise<boolean>, runTool?: (n: string, i: unknown) => Promise<ToolOutcome>, permission?: PermissionLevel } = {}) {
  const events: [string, unknown][] = []
  const runTool = vi.fn(opts.runTool ?? (async (name: string) => ({ ok: true as const, data: { from: name } })))
  const confirm = vi.fn(opts.confirm ?? (async () => true))
  const deps: AgentDeps = {
    step: createStepClient(f),
    runTool,
    confirm,
    emit: (type, payload) => { events.push([type, payload]) },
    lang: () => 'en',
    sessionId: 'sess-1',
    now: () => new Date('2026-10-24T12:00:00+09:00'),
    ...(opts.permission ? { permission: () => opts.permission! } : {}),
  }
  return { deps, events, runTool, confirm }
}

const thinking = { type: 'thinking', thinking: 'plan', signature: 'sig-abc' }

describe('agent loop', () => {
  it('runs reads automatically, asks before writes, and returns declined writes as non-error results', async () => {
    const { fetch, bodies } = fakeFetch([
      { body: { stopReason: 'tool_use', content: [thinking, { type: 'tool_use', id: 't1', name: 'mail_list', input: {} }, { type: 'tool_use', id: 't2', name: 'mail_read', input: { id: 'm1' } }] } },
      { body: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 't3', name: 'mail_create_draft', input: { to: 'a@x.com', subject: 'Re', body: 'Hi' } }] } },
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Okay, I did not save the draft.' }] } },
    ])
    const { deps, events, runTool, confirm } = makeDeps(fetch, { confirm: async () => false })
    const result = await handleDelegate({ request: 'Reply to the latest mail', origin: 'utterance' }, deps)

    expect(result).toMatchObject({ ok: true, text: 'Okay, I did not save the draft.', steps: 3 })
    // Reads ran, the write did not.
    expect(runTool.mock.calls.map(c => c[0])).toEqual(['mail_list', 'mail_read'])
    expect(confirm).toHaveBeenCalledWith({
      kind: 'write', op: 'mail_create_draft', grade: 'write',
      fields: [{ field: 'to', value: 'a@x.com' }, { field: 'subject', value: 'Re' }, { field: 'body', value: 'Hi', multiline: true }],
    })

    // Request 1: one user message with request + context.
    expect(bodies[0]).toMatchObject({ lang: 'en', origin: 'utterance', sessionId: 'sess-1' })
    expect(bodies[0]!.messages).toHaveLength(1)
    expect((bodies[0]!.messages[0] as { content: string }).content).toContain('Reply to the latest mail')
    expect((bodies[0]!.messages[0] as { content: string }).content).toContain('User language: en')

    // Request 2: assistant content passed back unchanged (thinking included), all tool results in ONE user message.
    const m2 = bodies[1]!.messages as { role: string, content: unknown }[]
    expect(m2).toHaveLength(3)
    expect(m2[1]!.content).toEqual([thinking, { type: 'tool_use', id: 't1', name: 'mail_list', input: {} }, { type: 'tool_use', id: 't2', name: 'mail_read', input: { id: 'm1' } }])
    expect(m2[2]).toEqual({ role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: JSON.stringify({ from: 'mail_list' }) },
      { type: 'tool_result', tool_use_id: 't2', content: JSON.stringify({ from: 'mail_read' }) },
    ] })

    // Request 3: declined write.
    const m3 = bodies[2]!.messages as { role: string, content: unknown }[]
    expect(m3[4]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't3', content: DECLINED_RESULT, is_error: false }] })

    // State events: busy on, working, ..., busy off, idle, then the spoken reaction.
    expect(events[0]).toEqual(['agent:busy', { busy: true }])
    expect(events[1]).toEqual(['character:node', { node: 'working' }])
    const iBusyOff = events.findIndex(e => e[0] === 'agent:busy' && (e[1] as { busy: boolean }).busy === false)
    expect(events[iBusyOff + 1]).toEqual(['character:node', { node: 'idle' }])
    expect(events.at(-1)).toEqual(['character:react', { emotion: 'happy', line: 'Okay, I did not save the draft.', source: 'agent' }])
  })

  it('runs an accepted write and reports unknown tools / bad input as errors', async () => {
    const { fetch, bodies } = fakeFetch([
      { body: { stopReason: 'tool_use', content: [
        { type: 'tool_use', id: 'a', name: 'mail_send', input: {} },
        { type: 'tool_use', id: 'b', name: 'calendar_create_event', input: { title: 'X' } },
        { type: 'tool_use', id: 'c', name: 'calendar_create_event', input: { title: 'Sync', start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T16:00:00+09:00' } },
      ] } },
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Added Sync at 3 pm.\n\nIt runs until 4 pm.' }] } },
    ])
    const { deps, events, runTool, confirm } = makeDeps(fetch)
    await handleDelegate({ request: 'add a sync', origin: 'utterance' }, deps)

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(runTool).toHaveBeenCalledWith('calendar_create_event', { title: 'Sync', start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T16:00:00+09:00' })
    const results = (bodies[1]!.messages[2] as { content: { tool_use_id: string, is_error?: boolean }[] }).content
    expect(results.map(r => [r.tool_use_id, r.is_error ?? false])).toEqual([['a', true], ['b', true], ['c', false]])
    expect(events).toContainEqual(['character:react', { emotion: 'happy', line: 'Added Sync at 3 pm.', source: 'agent' }])
    expect(events.at(-1)).toEqual(['bubble', { text: 'Added Sync at 3 pm.\n\nIt runs until 4 pm.', ttlMs: expect.any(Number) }])
  })

  it('screen origin: declined suggestion makes no model call', async () => {
    const { fetch, fn } = fakeFetch([])
    const { deps, events, confirm } = makeDeps(fetch, { confirm: async () => false })
    const r = await handleDelegate({ request: 'Draft a reply to Tanaka', origin: 'screen' }, deps)
    expect(r).toBeNull()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'suggestion', request: 'Draft a reply to Tanaka' }))
    expect(fn).not.toHaveBeenCalled()
    expect(events).toContainEqual(['character:react', { emotion: 'neutral', source: 'agent' }])
    expect(events.some(e => e[0] === 'agent:busy')).toBe(false)
  })

  it('screen origin: accepted suggestion runs with origin screen', async () => {
    const { fetch, bodies } = fakeFetch([{ body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }])
    const { deps } = makeDeps(fetch, { confirm: async () => true })
    await handleDelegate({ request: 'Check conflicts', origin: 'screen' }, deps)
    expect(bodies[0]!.origin).toBe('screen')
  })

  it('falls back to a prepared line when the backend is unconfigured, and always clears busy', async () => {
    const { fetch } = fakeFetch([{ status: 503, body: { error: 'agent model not configured', code: 'unconfigured' } }])
    const { deps, events } = makeDeps(fetch)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await handleDelegate({ request: 'x', origin: 'utterance' }, deps)
    warn.mockRestore()
    expect(r).toMatchObject({ ok: false, cause: 'error' })
    expect(events).toContainEqual(['agent:busy', { busy: false }])
    expect(events).toContainEqual(['character:node', { node: 'idle' }])
    expect(events.at(-1)).toEqual(['character:react', { emotion: 'sorry', line: AGENT_STRINGS.en.fallbackLine, source: 'fallback' }])
  })

  it('calls the start/result hooks and speaks prepared lines when given', async () => {
    const { fetch } = fakeFetch([{ status: 503, body: { error: 'down', code: 'unconfigured' } }])
    const { deps, events } = makeDeps(fetch)
    const calls: string[] = []
    deps.onStart = origin => calls.push(`start:${origin}`)
    deps.onResult = r => calls.push(`result:${r.ok}`)
    deps.preparedLine = kind => `prepared ${kind}`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handleDelegate({ request: 'x', origin: 'utterance' }, deps)
    warn.mockRestore()
    expect(calls).toEqual(['start:utterance', 'result:false'])
    expect(events.at(-1)).toEqual(['character:react', { emotion: 'sorry', line: 'prepared offline', source: 'fallback' }])
  })

  it('stops after the step limit', async () => {
    const loop = { body: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'mail_list', input: {} }] } }
    const { fetch, fn } = fakeFetch(Array.from({ length: 10 }, () => structuredClone(loop)))
    const { deps, events } = makeDeps(fetch)
    const r = await handleDelegate({ request: 'loop', origin: 'utterance' }, deps)
    expect(fn).toHaveBeenCalledTimes(8)
    expect(r).toMatchObject({ ok: false, cause: 'max_steps' })
    expect(events.at(-1)).toEqual(['character:react', { emotion: 'sorry', line: AGENT_STRINGS.en.incompleteLine, source: 'agent' }])
  })
})

describe('splitForSpeech', () => {
  it('takes the first paragraph and strips markdown', () => {
    expect(splitForSpeech('**Done!** Saved it.\n\n- detail')).toEqual({ line: 'Done! Saved it.', hasMore: true })
    expect(splitForSpeech('Short.')).toEqual({ line: 'Short.', hasMore: false })
  })
  it('caps long lines at a sentence boundary', () => {
    const long = `${'a'.repeat(100)}. ${'b'.repeat(100)}. ${'c'.repeat(100)}.`
    const r = splitForSpeech(long)
    expect(r.line).toBe(`${'a'.repeat(100)}. ${'b'.repeat(100)}.`)
    expect(r.hasMore).toBe(true)
  })
})

describe('agent loop persona', () => {
  it('sends the active persona with every step and omits it when absent', async () => {
    const persona = { name: 'Yui', prompt: 'Playful.', speakingStyle: 'Bubbly.' }
    const { fetch, bodies } = fakeFetch([{ body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Hi!' }] } }])
    const { deps } = makeDeps(fetch)
    await handleDelegate({ request: 'Say hi', origin: 'utterance' }, { ...deps, persona: () => persona })
    expect(bodies[0]!.persona).toEqual(persona)

    const second = fakeFetch([{ body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Hi' }] } }])
    await handleDelegate({ request: 'Say hi', origin: 'utterance' }, makeDeps(second.fetch).deps)
    expect('persona' in second.bodies[0]!).toBe(false)
  })

  it('confirms per permission level: auto skips write cards, bypass skips all', async () => {
    const script = () => [
      { body: { stopReason: 'tool_use', content: [
        { type: 'tool_use', id: 'w', name: 'mail_trash', input: { id: 'm1' } },
        { type: 'tool_use', id: 'o', name: 'mail_reply', input: { id: 'm2', body: 'OK' } },
      ] } },
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } },
    ]
    const auto = makeDeps(fakeFetch(script()).fetch, { permission: 'auto' })
    await handleDelegate({ request: 'x', origin: 'utterance' }, auto.deps)
    expect(auto.confirm.mock.calls.map(c => (c[0] as { op: string }).op)).toEqual(['mail_reply'])
    expect(auto.confirm.mock.calls[0]![0]).toMatchObject({ grade: 'outbound' })
    expect(auto.runTool.mock.calls.map(c => c[0])).toEqual(['mail_trash', 'mail_reply'])

    const bypass = makeDeps(fakeFetch(script()).fetch, { permission: 'bypass' })
    await handleDelegate({ request: 'x', origin: 'utterance' }, bypass.deps)
    expect(bypass.confirm).not.toHaveBeenCalled()
    expect(bypass.runTool).toHaveBeenCalledTimes(2)

    const manual = makeDeps(fakeFetch(script()).fetch)
    await handleDelegate({ request: 'x', origin: 'utterance' }, manual.deps)
    expect(manual.confirm).toHaveBeenCalledTimes(2)
  })

  it('still shows the suggestion card for screen-origin work under bypass, with the localized summary', async () => {
    const { deps, confirm } = makeDeps(fakeFetch([]).fetch, { permission: 'bypass', confirm: async () => false })
    const r = await handleDelegate({ request: 'Draft a reply', summary: '답장 초안을 써 둘까?', origin: 'screen' }, deps)
    expect(r).toBeNull()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'suggestion', summary: '답장 초안을 써 둘까?' }))
  })

  it('calls the actuator around tools and on decline', async () => {
    const { fetch } = fakeFetch([
      { body: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'p', name: 'discord_post', input: { channelId: 'D1', text: 'hi' } }] } },
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'Okay.' }] } },
    ])
    const calls: string[] = []
    const { deps } = makeDeps(fetch, { confirm: async () => false })
    deps.actuator = {
      before: async (op, _i, grade) => { calls.push(`before:${op}:${grade}`) },
      after: (op, _i, outcome) => { calls.push(`after:${op}:${outcome === null ? 'declined' : 'ran'}`) },
    }
    await handleDelegate({ request: 'x', origin: 'utterance' }, deps)
    expect(calls).toEqual(['before:discord_post:outbound', 'after:discord_post:declined'])
  })
})
