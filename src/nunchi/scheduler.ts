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
import { currentLedger, gateProactive, loadLedger, minutesSince, recordInterjection, saveLedger, type GateReason, type KV, type Ledger } from './gate'
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

export interface EngineDeps {
  source: () => ScreenSource
  post: (req: ObserveRequest, signal: AbortSignal) => Promise<ObserveResult>
  emit: Emit
  settings: { readonly mode: AssistantMode, readonly lang: Lang, readonly sessionId: string, setMode(m: AssistantMode): void }
  storage: KV
  visible: () => boolean
  now?: () => number
}

/** Observable status for the indicator and debugging. */
export const nunchiStatus = reactive({
  dwellSec: 0,
  inFlight: false,
  last: 'idle' as 'idle' | 'silent' | 'acted' | `dropped:${GateReason}` | 'error' | 'budget',
  interjectionsToday: 0,
})

export type RoutedEvent =
  | { type: 'character:react', payload: BusEvents['character:react'] }
  | { type: 'agent:delegate', payload: BusEvents['agent:delegate'] }

/** Pure mapping from observer actions to bus events. */
export function routeActions(actions: ObserveAction[], origin: DelegateOrigin): RoutedEvent[] {
  return actions.map((a): RoutedEvent => a.type === 'react'
    ? { type: 'character:react', payload: { emotion: a.emotion, line: a.line, motion: a.motion, source: 'observer' } }
    : { type: 'agent:delegate', payload: { request: a.request, origin } })
}

export class NunchiEngine {
  private readonly now: () => number
  private readonly dwell = new DwellTracker()
  readonly dialogue = new DialogueLog()
  private ledger: Ledger
  private timer: ReturnType<typeof setInterval> | null = null
  private pollCtl: AbortController | null = null
  private pollStartedAt = 0
  private utterCtl: AbortController | null = null
  private capturing = false
  private capturePromise: Promise<Frame | null> | null = null
  private agentBusy = false
  private speaking = false
  private lastFallbackAt = -Infinity
  private fallbackSeq = 0

  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now
    this.ledger = loadLedger(d.storage, this.now())
    nunchiStatus.interjectionsToday = this.ledger.count
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
  onAssistantLine(line: string): void { this.dialogue.push('assistant', line) }

  /** Called when the page is hidden or observing stops. */
  pause(): void {
    this.pollCtl?.abort()
    this.pollCtl = null
    this.dwell.reset()
  }

  async tick(): Promise<void> {
    if (this.d.settings.mode !== 'active' || !this.d.visible()) { this.pause(); return }
    if (this.agentBusy || this.capturing || this.utterCtl) return
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

    // Re-read live state: the user may have started typing or speaking during the call.
    const now = this.now()
    const activity = this.d.source().activity()
    const gate = gateProactive({ now, ledger: this.ledger, dwellSec: this.dwell.seconds(now), typing: activity.typing, userSpeaking: this.speaking })
    if (!gate.allow) { nunchiStatus.last = `dropped:${gate.reason}`; return }
    if (this.d.settings.mode !== 'active' || this.agentBusy) return

    this.dispatch(actions, 'screen')
    this.ledger = recordInterjection(this.ledger, now)
    saveLedger(this.d.storage, this.ledger)
    nunchiStatus.interjectionsToday = this.ledger.count
    nunchiStatus.last = 'acted'
    this.d.emit('nunchi:interjected', { at: now })
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
      return
    }
    nunchiStatus.last = res.response.actions.length ? 'acted' : 'silent'
    this.dispatch(res.response.actions, 'utterance')
  }

  private dispatch(actions: ObserveAction[], origin: DelegateOrigin): void {
    for (const ev of routeActions(actions, origin)) {
      if (ev.type === 'character:react') this.d.emit('character:react', ev.payload)
      else this.d.emit('agent:delegate', ev.payload)
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
    const ledger = currentLedger(this.ledger, now)
    return {
      frame: frame ? { jpegBase64: frame.jpegBase64, width: frame.width, height: frame.height } : null,
      state: {
        activeApp: activity.activeApp,
        windowTitle: activity.windowTitle,
        dwellSec,
        minutesSinceLastInterjection: minutesSince(ledger, now),
        interjectionsToday: ledger.count,
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
