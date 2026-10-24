// TTS playback through WebAudio. One line at a time: a new line replaces the current one.

import type { SpeechRequest } from '@shared/contracts'
import { bus } from '@/core/bus'
import { LipSync } from './lipsync'
import { voiceState } from './state'
import { fetchSpeech } from './tts-client'
import { setVadEchoMode } from './vad'

interface Playback {
  id: number
  abort: AbortController
  source: AudioBufferSourceNode | null
  gain: GainNode | null
  started: boolean
  done: boolean
}

export class SpeechPlayer {
  private ctx: AudioContext | null = null
  private lipsync: LipSync | null = null
  private current: Playback | null = null
  private nextId = 0

  private context(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
      this.lipsync = new LipSync(this.ctx)
    }
    return this.ctx
  }

  /** Call from a user gesture so later playback is not blocked by autoplay policy. */
  unlock(): void {
    const ctx = this.context()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  }

  get playing(): boolean {
    return !!this.current?.started && !this.current.done
  }

  /** Fetches and plays a line. Resolves when playback ends or is replaced. */
  async say(req: SpeechRequest): Promise<void> {
    this.stop({ interrupted: true, fadeMs: 60, node: 'idle' })
    const pb: Playback = { id: ++this.nextId, abort: new AbortController(), source: null, gain: null, started: false, done: false }
    this.current = pb

    const bytes = await fetchSpeech(req, pb.abort.signal)
    if (!bytes || this.current !== pb) return
    const ctx = this.context()
    let buffer: AudioBuffer
    try {
      if (ctx.state === 'suspended') await ctx.resume()
      buffer = await ctx.decodeAudioData(bytes)
    } catch (e) {
      console.warn('[voice] tts decode/playback blocked', e)
      if (this.current === pb) this.current = null
      return
    }
    if (this.current !== pb || pb.abort.signal.aborted) return

    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    if (this.lipsync) gain.connect(this.lipsync.input)
    pb.source = source
    pb.gain = gain

    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.finish(pb, { interrupted: false, node: 'idle' })
        resolve()
      }
      pb.abort.signal.addEventListener('abort', () => resolve(), { once: true })
      source.start()
      pb.started = true
      voiceState.speaking = true
      setVadEchoMode(true)
      this.lipsync?.start()
      bus.emit('tts:start', { text: req.text })
      bus.emit('character:node', { node: 'speaking' })
    })
  }

  /**
   * Stops the current line (fade, then stop) and aborts its fetch. Emits `tts:end` only
   * when audio had started. `node` is the character node to set afterwards (null: leave it).
   */
  stop(opts: { interrupted: boolean, fadeMs: number, node: 'idle' | 'listening' | null }): void {
    const pb = this.current
    if (!pb || pb.done) return
    pb.abort.abort()
    const { source, gain, started } = pb
    if (source && gain && this.ctx) {
      const t = this.ctx.currentTime
      const fade = Math.max(0.005, opts.fadeMs / 1000)
      source.onended = null
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(gain.gain.value, t)
      gain.gain.linearRampToValueAtTime(0, t + fade)
      try { source.stop(t + fade) } catch { /* already stopped */ }
      setTimeout(() => gain.disconnect(), opts.fadeMs + 50)
    }
    if (started) this.finish(pb, opts)
    else { pb.done = true; if (this.current === pb) this.current = null }
  }

  private finish(pb: Playback, opts: { interrupted: boolean, node: 'idle' | 'listening' | null }): void {
    if (pb.done) return
    pb.done = true
    if (this.current === pb) this.current = null
    this.lipsync?.stop()
    voiceState.speaking = false
    setVadEchoMode(false)
    bus.emit('tts:end', { interrupted: opts.interrupted })
    if (opts.node) bus.emit('character:node', { node: opts.node })
  }
}
