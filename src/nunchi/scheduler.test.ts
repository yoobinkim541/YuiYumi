import { describe, expect, it } from 'vitest'
import type { ObserveAction, ObserveRequest } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { ActivitySnapshot, ScreenSource } from '@/core/types'
import type { AssistantMode } from '@/stores/settings'
import type { ObserveResult } from './observer-client'
import { LOOK_HOLD_MS, NunchiEngine, POLL_MS, POLL_STALE_MS, type LookTarget } from './scheduler'

function harness(opts: { actions?: ObserveAction[], result?: ObserveResult, mode?: AssistantMode, look?: LookTarget | null } = {}) {
  let t = new Date(2026, 9, 24, 14, 0, 0).getTime()
  const activity: ActivitySnapshot = { activeApp: 'Mail', windowTitle: 'Mail — Inbox', typing: false }
  const source: ScreenSource = {
    capture: async () => ({ jpegBase64: 'AAAA', width: 1920, height: 1080, hash: '0'.repeat(36) }),
    activity: () => activity,
  }
  const sent: ObserveRequest[] = []
  const events: { type: string, payload: unknown }[] = []
  const settings = { mode: opts.mode ?? 'active' as AssistantMode, lang: 'ja' as Lang, sessionId: 's', setMode(m: AssistantMode) { this.mode = m } }
  const engine = new NunchiEngine({
    source: () => source,
    post: async req => { sent.push(req); return opts.result ?? { ok: true, response: { actions: opts.actions ?? [] } } },
    emit: (type, payload) => { events.push({ type, payload }) },
    settings,
    visible: () => true,
    lookTarget: () => opts.look === undefined ? { x: 600, y: 420, fresh: true } : opts.look,
    now: () => t,
  })
  return { engine, sent, events, activity, settings, advance: (ms: number) => { t += ms } }
}

const REACT: ObserveAction = { type: 'react', emotion: 'happy', line: '返信の下書き、書こうか?' }
const DELEGATE: ObserveAction = { type: 'delegate_task', request: 'Draft a reply to Sato' }

describe('NunchiEngine proactive path', () => {
  it('speaks up on the first check: no dwell, no daily limit', async () => {
    const h = harness({ actions: [REACT, DELEGATE] })
    await h.engine.tick()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]!.utterance).toBeUndefined()
    expect(h.events.map(e => e.type)).toEqual(['character:look', 'character:react', 'agent:delegate', 'nunchi:interjected'])
    expect(h.events[0]!.payload).toEqual({ x: 600, y: 420, holdMs: LOOK_HOLD_MS })
    expect((h.events[2]!.payload as { origin: string }).origin).toBe('screen')
  })

  it('keeps a 20 s gap after a line, without even asking the observer', async () => {
    const h = harness({ actions: [REACT] })
    await h.engine.tick()
    h.events.length = 0
    h.advance(POLL_MS)
    await h.engine.tick()
    expect(h.sent).toHaveLength(1)
    expect(h.events).toEqual([])
    h.advance(18_000)
    await h.engine.tick()
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1]!.state.secondsSinceLastLine).toBe(21)
    expect(h.events.map(e => e.type)).toContain('character:react')
  })

  it('comments while the user is typing', async () => {
    const h = harness({ actions: [REACT] })
    h.activity.typing = true
    await h.engine.tick()
    expect(h.sent[0]!.state.typing).toBe(true)
    expect(h.events.map(e => e.type)).toContain('character:react')
  })

  it('stays silent while her voice plays or the user speaks, and counts the gap from the end of her line', async () => {
    const h = harness({ actions: [REACT] })
    h.engine.setTtsPlaying(true)
    await h.engine.tick()
    expect(h.sent).toHaveLength(0)
    h.advance(30_000)
    h.engine.setTtsPlaying(false)
    h.advance(10_000)
    await h.engine.tick()
    expect(h.sent).toHaveLength(0)
    h.advance(10_000)
    h.engine.setSpeaking(true)
    await h.engine.tick()
    expect(h.sent).toHaveLength(0)
    h.engine.setSpeaking(false)
    await h.engine.tick()
    expect(h.events.map(e => e.type)).toContain('character:react')
  })

  it('drops the result when she started talking during the call', async () => {
    const h = harness({ actions: [REACT] })
    const tick = h.engine.tick()
    h.engine.setTtsPlaying(true)
    await tick
    expect(h.events).toEqual([])
  })

  it('remarks without a glance when there is no target', async () => {
    const h = harness({ actions: [REACT], look: null })
    await h.engine.tick()
    expect(h.events.map(e => e.type)).toEqual(['character:react', 'nunchi:interjected'])
  })

  it('does not capture or call in quiet mode', async () => {
    const h = harness({ actions: [REACT], mode: 'quiet' })
    await h.engine.tick()
    expect(h.sent).toHaveLength(0)
  })
})

describe('NunchiEngine utterance path', () => {
  it('wakes from quiet, bypasses the gate and marks origin utterance', async () => {
    const h = harness({ actions: [DELEGATE], mode: 'quiet' })
    await h.engine.onTranscript('返信の下書きを書いて', 'ja')
    expect(h.settings.mode).toBe('active')
    expect(h.sent[0]!.utterance).toBe('返信の下書きを書いて')
    expect(h.events).toEqual([{ type: 'agent:delegate', payload: { request: 'Draft a reply to Sato', origin: 'utterance' } }])
  })

  it('keeps the mode and sends nothing for an empty transcript', async () => {
    const h = harness({ mode: 'ornamental' })
    await h.engine.onTranscript('  ', 'ja')
    expect(h.settings.mode).toBe('ornamental')
    expect(h.sent).toHaveLength(0)
  })

  it('emits a rate-limited fallback line on API failure', async () => {
    const h = harness({ result: { ok: false, aborted: false, code: 'budget', status: 429 } })
    await h.engine.onTranscript('こんにちは', 'ja')
    await h.engine.onTranscript('もしもし', 'ja')
    const lines = () => h.events.filter(e => e.type === 'character:react')
    expect(lines()).toHaveLength(1)
    expect(lines()[0]!.payload).toMatchObject({ source: 'fallback' })
    h.advance(31_000)
    await h.engine.onTranscript('もしもし', 'ja')
    expect(lines()).toHaveLength(2)
  })

  it('drops the typing dots when the reply has no line, and moves only on request', async () => {
    const h = harness({ actions: [{ type: 'move_self', where: 'center' }] })
    await h.engine.onTranscript('가운데로 와', 'ko')
    expect(h.events).toEqual([
      { type: 'thinking', payload: { on: false } },
      { type: 'assistant:move', payload: { where: 'center' } },
    ])
    const quiet = harness({ actions: [] })
    await quiet.engine.onTranscript('음', 'ko')
    expect(quiet.events).toEqual([{ type: 'thinking', payload: { on: false } }])
    const talk = harness({ actions: [REACT], look: { x: 600, y: 420, fresh: false } })
    await talk.engine.onTranscript('안녕', 'ko')
    expect(talk.events.map(e => e.type)).toEqual(['character:react'])
  })

  it('glances at the screen while answering only when the user is acting there', async () => {
    const busy = harness({ actions: [REACT] })
    await busy.engine.onTranscript('이거 어때?', 'ko')
    expect(busy.events.map(e => e.type)).toEqual(['character:look', 'character:react'])
    const idle = harness({ actions: [REACT], look: { x: 600, y: 420, fresh: false } })
    await idle.engine.onTranscript('이거 어때?', 'ko')
    expect(idle.events.map(e => e.type)).toEqual(['character:react'])
  })

  it('sends recent dialogue without duplicating the utterance', async () => {
    const h = harness({ actions: [] })
    h.engine.onAssistantLine('こんにちは!')
    await h.engine.onTranscript('元気?', 'ja')
    expect(h.sent[0]!.recent).toEqual([{ role: 'assistant', text: 'こんにちは!' }])
  })
})

describe('NunchiEngine slow observer', () => {
  it('lets a slow poll finish instead of aborting it on the next tick, until it is stale', async () => {
    let t = new Date(2026, 9, 24, 14, 0, 0).getTime()
    const source: ScreenSource = {
      capture: async () => ({ jpegBase64: 'AAAA', width: 1920, height: 1080, hash: '0'.repeat(36) }),
      activity: () => ({ activeApp: 'Mail', windowTitle: 'Mail', typing: false }),
    }
    const signals: AbortSignal[] = []
    const engine = new NunchiEngine({
      source: () => source,
      post: (_req, signal) => { signals.push(signal); return new Promise<ObserveResult>(() => {}) },
      emit: () => {},
      settings: { mode: 'active', lang: 'ko', sessionId: 's', setMode() {} },
      visible: () => true,
      now: () => t,
    })
    void engine.tick()
    await new Promise(r => setTimeout(r, 0))
    expect(signals).toHaveLength(1)
    t += POLL_MS
    void engine.tick()
    await new Promise(r => setTimeout(r, 0))
    expect(signals).toHaveLength(1)
    expect(signals[0]!.aborted).toBe(false)
    t += POLL_STALE_MS
    void engine.tick()
    await new Promise(r => setTimeout(r, 0))
    expect(signals).toHaveLength(2)
    expect(signals[0]!.aborted).toBe(true)
  })
})

describe('NunchiEngine utterance during a capture', () => {
  it('reuses the in-flight frame instead of sending none', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const source: ScreenSource = {
      capture: async () => { await gate; return { jpegBase64: 'BBBB', width: 1920, height: 1080, hash: '0'.repeat(36) } },
      activity: () => ({ activeApp: 'Mail', windowTitle: 'Mail', typing: false }),
    }
    const sent: ObserveRequest[] = []
    const engine = new NunchiEngine({
      source: () => source,
      post: async req => { sent.push(req); return { ok: true, response: { actions: [] } } },
      emit: () => {},
      settings: { mode: 'active', lang: 'ko', sessionId: 's', setMode() {} },
      visible: () => true,
    })
    const tick = engine.tick()
    const utter = engine.onTranscript('안녕', 'ko')
    release()
    await Promise.all([tick, utter])
    const withUtterance = sent.find(r => r.utterance)
    expect(withUtterance?.frame?.jpegBase64).toBe('BBBB')
  })
})
