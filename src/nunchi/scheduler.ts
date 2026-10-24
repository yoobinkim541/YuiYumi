// Nunchi engine: 3 s screen polling, utterance path, gate, and action routing.
// Dependencies are injected so the browser wiring stays in index.ts.

import { reactive } from 'vue'
import type { DelegateOrigin, ObserveAction, ObserveRequest } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { BusEvents } from '@/core/bus'
import type { Frame, ScreenSource } from '@/core/types'
import type { AssistantMode } from '@/stores/settings'
import { DialogueLog } from './dialogue'
import { DwellTracker } from './dwell'
import { FALLBACK_MIN_INTERVAL_MS, pickFallback } from './fallback-lines'
import { gateProactive, type GateReason } from './gate'
import { modeAfterTranscript } from './mode'
import type { ObserveResult } from './observer-client'

export const POLL_MS = 3000
/**
 * A poll still in flight is left alone until it is this old. Observer calls that end in a
 * tool call routinely take longer than POLL_MS, so aborting on every tick would cancel
 * exactly the responses that carry an action.
 */
export const POLL_STALE_MS = 15_000

type Emit = <K extends keyof BusEvents>(type: K, payload: BusEvents[K]) => void

/**
 * Where on the desktop the user is acting (logical 1920x1080 coordinates). `fresh` is true
 * when it comes from recent input or a screen change rather than just the focused window.
 */
export interface LookTarget {
  x: number
  y: number
  fresh: boolean
}

/** How long she keeps looking at the activity when she speaks up (longer while talking). */
export const LOOK_HOLD_MS = 4000

export interface EngineDeps {
  source: () => ScreenSource
  post: (req: ObserveRequest, signal: AbortSignal) => Promise<ObserveResult>
  emit: Emit
  settings: { readonly mode: AssistantMode, readonly lang: Lang, readonly sessionId: string, setMode(m: AssistantMode): void }
  visible: () => boolean
  /** Where the user is acting on screen, for her glance when she remarks on it. */
  lookTarget?: () => LookTarget | null
  now?: () => number
}

/** Observable status for the indicator and debugging. */
export const nunchiStatus = reactive({
  dwellSec: 0,
  inFlight: false,
  last: 'idle' as 'idle' | 'silent' | 'acted' | `dropped:${GateReason}` | 'error' | 'budget',
  /** Proactive remarks shown since the page loaded. */
  proactiveCount: 0,
  lastProactiveAt: null as number | null,
})

export type RoutedEvent =
  | { type: 'character:react', payload: BusEvents['character:react'] }
  | { type: 'agent:delegate', payload: BusEvents['agent:delegate'] }
  | { type: 'assistant:move', payload: BusEvents['assistant:move'] }

/** Pure mapping from observer actions to bus events. */
export function routeActions(actions: ObserveAction[], origin: DelegateOrigin): RoutedEvent[] {
  return actions.map((a): RoutedEvent => {
    switch (a.type) {
      case 'react': return { type: 'character:react', payload: { emotion: a.emotion, line: a.line, motion: a.motion, source: 'observer' } }
      case 'delegate_task': return { type: 'agent:delegate', payload: { request: a.request, origin, ...(a.summary ? { summary: a.summary } : {}) } }
      case 'move_self': return { type: 'assistant:move', payload: { where: a.where } }
    }
  })
}

export class NunchiEngine {
  private readonly now: () => number
  private readonly dwell = new DwellTracker()
  readonly dialogue = new DialogueLog()
  private timer: ReturnType<typeof setInterval> | null = null
  private pollCtl: AbortController | null = null
  private pollStartedAt = 0
  private utterCtl: AbortController | null = null
  private capturing = false
  private capturePromise: Promise<Frame | null> | null = null
  private agentBusy = false
  private speaking = false
  private ttsPlaying = false
  /** When she last said a line of any origin; proactive lines keep a gap after it. */
  private lastLineAt: number | null = null
  private lastFallbackAt = -Infinity
  private fallbackSeq = 0

  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.tick() }, POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.pollCtl?.abort()
  }

  setAgentBusy(busy: boolean): void { this.agentBusy = busy }
  setSpeaking(speaking: boolean): void { this.speaking = speaking }
  setTtsPlaying(playing: boolean): void {
    this.ttsPlaying = playing
    // The gap runs from the end of her line, not its start.
    if (!playing) this.lastLineAt = this.now()
  }
  onAssistantLine(line: string): void {
    this.dialogue.push('assistant', line)
    this.lastLineAt = this.now()
  }

  /** Called when the page is hidden or observing stops. */
  pause(): void {
    this.pollCtl?.abort()
    this.pollCtl = null
    this.dwell.reset()
  }

  async tick(): Promise<void> {
    if (this.d.settings.mode !== 'active' || !this.d.visible()) { this.pause(); return }
    if (this.agentBusy || this.capturing || this.utterCtl) return
    // No point asking while a gated remark could not be shown anyway.
    if (!gateProactive(this.gateInput(this.now())).allow) return
    if (this.pollCtl && this.now() - this.pollStartedAt < POLL_STALE_MS) return

    this.pollCtl?.abort()
    const ctl = new AbortController()
    this.pollCtl = ctl
    this.pollStartedAt = this.now()

    const frame = await this.captureSafe()
    if (ctl.signal.aborted || !frame) return
    const dwellSec = this.dwell.update(frame.hash, this.now())
    nunchiStatus.dwellSec = dwellSec

    const req = this.buildRequest(frame, dwellSec)
    nunchiStatus.inFlight = true
    const res = await this.d.post(req, ctl.signal)
    if (this.pollCtl === ctl) { this.pollCtl = null; nunchiStatus.inFlight = false }
    if (!res.ok) {
      if (!res.aborted) nunchiStatus.last = res.code === 'budget' ? 'budget' : 'error'
      return
    }
    const actions = res.response.actions
    if (!actions.length) { nunchiStatus.last = 'silent'; return }

    // Re-read live state: the user may have started speaking, or she talking, during the call.
    const now = this.now()
    const gate = gateProactive(this.gateInput(now))
    if (!gate.allow) { nunchiStatus.last = `dropped:${gate.reason}`; return }
    if (this.d.settings.mode !== 'active') return

    // She glances at what she is remarking on as she starts to speak.
    this.glance(this.d.lookTarget?.() ?? null)
    this.dispatch(actions, 'screen')
    if (actions.some(a => a.type === 'react' && a.line)) this.lastLineAt = now
    nunchiStatus.proactiveCount++
    nunchiStatus.lastProactiveAt = now
    nunchiStatus.last = 'acted'
    this.d.emit('nunchi:interjected', { at: now })
  }

  private gateInput(now: number) {
    return { now, lastLineAt: this.lastLineAt, userSpeaking: this.speaking, ttsPlaying: this.ttsPlaying, agentBusy: this.agentBusy }
  }

  private glance(target: LookTarget | null): void {
    if (target) this.d.emit('character:look', { x: target.x, y: target.y, holdMs: LOOK_HOLD_MS })
  }

  async onTranscript(text: string, lang: Lang): Promise<void> {
    const t = text.trim()
    const mode = this.d.settings.mode
    const next = modeAfterTranscript(mode, t)
    if (next !== mode) this.d.settings.setMode(next)
    if (!t) return

    this.dialogue.push('user', t)
    this.pollCtl?.abort()
    this.pollCtl = null
    this.utterCtl?.abort()
    const ctl = new AbortController()
    this.utterCtl = ctl

    const frame = await this.captureSafe()
    const dwellSec = frame ? this.dwell.update(frame.hash, this.now()) : this.dwell.seconds(this.now())
    // The utterance itself is already the last `recent` turn; send it separately only.
    const req = this.buildRequest(frame, dwellSec, t, lang)
    req.recent = req.recent.slice(0, -1)
    nunchiStatus.inFlight = true
    const res = await this.d.post(req, ctl.signal)
    if (this.utterCtl === ctl) { this.utterCtl = null; nunchiStatus.inFlight = false }
    if (!res.ok) {
      if (!res.aborted) this.fallback(lang)
      if (this.utterCtl === null) this.d.emit('thinking', { on: false })
      return
    }
    const actions = res.response.actions
    nunchiStatus.last = actions.length ? 'acted' : 'silent'
    // No spoken line and no delegated work: drop the typing dots now instead of on timeout.
    const speaks = actions.some(a => (a.type === 'react' && a.line) || a.type === 'delegate_task')
    if (!speaks) this.d.emit('thinking', { on: false })
    // A spoken reply while the user is busy in an app looks over at that spot; otherwise
    // she keeps facing the user.
    if (actions.some(a => a.type === 'react' && a.line)) {
      const target = this.d.lookTarget?.() ?? null
      if (target?.fresh) this.glance(target)
    }
    this.dispatch(actions, 'utterance')
  }

  private dispatch(actions: ObserveAction[], origin: DelegateOrigin): void {
    for (const ev of routeActions(actions, origin)) {
      if (ev.type === 'character:react') this.d.emit('character:react', ev.payload)
      else if (ev.type === 'agent:delegate') this.d.emit('agent:delegate', ev.payload)
      // Moving is only ever done on the user's request, never from a screen poll.
      else if (origin === 'utterance') this.d.emit('assistant:move', ev.payload)
    }
  }

  private fallback(lang: Lang): void {
    const now = this.now()
    if (now - this.lastFallbackAt < FALLBACK_MIN_INTERVAL_MS) return
    this.lastFallbackAt = now
    const f = pickFallback(lang, this.fallbackSeq++)
    this.d.emit('character:react', { emotion: f.emotion, line: f.line, source: 'fallback' })
  }

  /** One capture at a time; a caller arriving mid-capture shares that frame instead of getting none. */
  private captureSafe(): Promise<Frame | null> {
    if (this.capturing) return this.capturePromise ?? Promise.resolve(null)
    this.capturing = true
    this.capturePromise = (async () => {
      try {
        return await this.d.source().capture()
      } catch (e) {
        console.warn('[nunchi] capture failed', e)
        return null
      } finally {
        this.capturing = false
        this.capturePromise = null
      }
    })()
    return this.capturePromise
  }

  private buildRequest(frame: Frame | null, dwellSec: number, utterance?: string, lang?: Lang): ObserveRequest {
    const now = this.now()
    const activity = this.d.source().activity()
    return {
      frame: frame ? { jpegBase64: frame.jpegBase64, width: frame.width, height: frame.height } : null,
      state: {
        activeApp: activity.activeApp,
        windowTitle: activity.windowTitle,
        dwellSec,
        secondsSinceLastLine: this.lastLineAt === null ? null : Math.max(0, Math.round((now - this.lastLineAt) / 1000)),
        typing: activity.typing,
        userSpeaking: this.speaking,
      },
      ...(utterance ? { utterance } : {}),
      lang: lang ?? this.d.settings.lang,
      recent: this.dialogue.recent(),
      sessionId: this.d.settings.sessionId,
    }
  }
}
