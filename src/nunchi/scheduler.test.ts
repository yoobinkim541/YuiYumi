import { describe, expect, it } from 'vitest'
import type { ObserveAction, ObserveRequest } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { ActivitySnapshot, ScreenSource } from '@/core/types'
import type { AssistantMode } from '@/stores/settings'
import type { KV } from './gate'
import type { ObserveResult } from './observer-client'
import { NunchiEngine, POLL_MS, POLL_STALE_MS } from './scheduler'

function harness(opts: { actions?: ObserveAction[], result?: ObserveResult, mode?: AssistantMode } = {}) {
  let t = new Date(2026, 9, 24, 14, 0, 0).getTime()
  const activity: ActivitySnapshot = { activeApp: 'Mail', windowTitle: 'Mail — Inbox', typing: false }
  const source: ScreenSource = {
    capture: async () => ({ jpegBase64: 'AAAA', width: 1920, height: 1080, hash: '0'.repeat(36) }),
    activity: () => activity,
  }
  const sent: ObserveRequest[] = []
  const events: { type: string, payload: unknown }[] = []
  const mem = new Map<string, string>()
  const storage: KV = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) } }
  const settings = { mode: opts.mode ?? 'active' as AssistantMode, lang: 'ja' as Lang, sessionId: 's', setMode(m: AssistantMode) { this.mode = m } }
  const engine = new NunchiEngine({
    source: () => source,
    post: async req => { sent.push(req); return opts.result ?? { ok: true, response: { actions: opts.actions ?? [] } } },
    emit: (type, payload) => { events.push({ type, payload }) },
    settings,
    storage,
    visible: () => true,
    now: () => t,
  })
  return { engine, sent, events, activity, settings, advance: (ms: number) => { t += ms } }
}

const REACT: ObserveAction = { type: 'react', emotion: 'happy', line: '返信の下書き、書こうか?' }
const DELEGATE: ObserveAction = { type: 'delegate_task', request: 'Draft a reply to Sato' }

describe('NunchiEngine proactive path', () => {
  it('calls the observer every tick but drops actions before 20 s of dwell', async () => {
    const h = harness({ actions: [REACT] })
    await h.engine.tick()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]!.utterance).toBeUndefined()
    expect(h.events).toEqual([])
  })

  it('acts after 20 s, emits interjected, then respects the 10 min cooldown', async () => {
    const h = harness({ actions: [REACT, DELEGATE] })
    await h.engine.tick()
    h.advance(21_000)
    await h.engine.tick()
    expect(h.sent[1]!.state.dwellSec).toBe(21)
    expect(h.events.map(e => e.type)).toEqual(['character:react', 'agent:delegate', 'nunchi:interjected'])
    expect((h.events[1]!.payload as { origin: string }).origin).toBe('screen')
    h.events.length = 0
    h.advance(60_000)
    await h.engine.tick()
    expect(h.events).toEqual([])
    expect(h.sent.at(-1)!.state.interjectionsToday).toBe(1)
  })

  it('stays silent while typing (AC-2)', async () => {
    const h = harness({ actions: [REACT] })
    await h.engine.tick()
    h.advance(25_000)
    h.activity.typing = true
    await h.engine.tick()
    expect(h.events).toEqual([])
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
    const talk = harness({ actions: [REACT] })
    await talk.engine.onTranscript('안녕', 'ko')
    expect(talk.events.map(e => e.type)).toEqual(['character:react'])
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
      storage: { getItem: () => null, setItem: () => {} },
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
      storage: { getItem: () => null, setItem: () => {} },
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
