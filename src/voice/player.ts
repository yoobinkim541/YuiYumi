// Speech playback through WebAudio: live TTS lines and pre-generated clips share one path
// (decode, lip sync, tts:start/tts:end). One line at a time: a new line replaces the
// current one once its audio is ready, so a short filler keeps playing until the real
// line can start. A `hold` line (an acknowledgement, a chime) is not cut: later lines
// wait for it to end.

import type { SpeechRequest } from '@shared/contracts'
import { bus } from '@/core/bus'
import { LipSync } from './lipsync'
import { voiceState } from './state'
import { fetchSpeech } from './tts-client'
import { setVadEchoMode } from './vad'

export interface PlayOptions {
  /** Later lines wait for this one to end instead of cutting it. */
  hold?: boolean
}

/** How a line ended: played to the end, cut or replaced, or never played (no audio). */
export type PlayResult = 'ended' | 'interrupted' | 'failed'

interface Playback {
  id: number
  abort: AbortController
  hold: boolean
  source: AudioBufferSourceNode | null
  gain: GainNode | null
  started: boolean
  done: boolean
  /** Resolves when the line is over, however it ended. */
  settled: Promise<void>
  settle: () => void
}

type NodeAfter = 'idle' | 'listening' | null

export class SpeechPlayer {
  private ctx: AudioContext | null = null
  private lipsync: LipSync | null = null
  private current: Playback | null = null
  /** Lines loading or waiting for a held line, oldest first. */
  private queue: Playback[] = []
  private nextId = 0
  /** Decoded clips by URL (built-in lines repeat). */
  private clips = new Map<string, AudioBuffer>()

  private context(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
      this.lipsync = new LipSync(this.ctx)
      this.clips.clear()
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

  /** A line is playing, loading or waiting to play. */
  get busy(): boolean {
    return this.playing || this.queue.length > 0
  }

  /** Fetches and plays a TTS line. */
  say(req: SpeechRequest, opts: PlayOptions = {}): Promise<PlayResult> {
    return this.playBytes(signal => fetchSpeech(req, signal), req.text, opts)
  }

  /** Plays a local clip (a built-in line) with the same lip sync, events and bubble timing as TTS. */
  playClip(url: string, text: string, opts: PlayOptions = {}): Promise<PlayResult> {
    return this.play(async (signal) => {
      const cached = this.clips.get(url)
      if (cached) return cached
      const res = await fetch(url, { signal })
      if (!res.ok) return null
      const buffer = await this.decode(await res.arrayBuffer())
      if (buffer) this.clips.set(url, buffer)
      return buffer
    }, text, opts)
  }

  /** Plays audio bytes from `load` (e.g. a TTS request started earlier). */
  playBytes(load: (signal: AbortSignal) => Promise<ArrayBuffer | null>, text: string, opts: PlayOptions = {}): Promise<PlayResult> {
    return this.play(async (signal) => {
      const bytes = await load(signal)
      return bytes ? this.decode(bytes) : null
    }, text, opts)
  }

  private async decode(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    const ctx = this.context()
    try {
      if (ctx.state === 'suspended') await ctx.resume()
      return await ctx.decodeAudioData(bytes)
    } catch (e) {
      console.warn('[voice] decode/playback blocked', e)
      return null
    }
  }

  private async play(load: (signal: AbortSignal) => Promise<AudioBuffer | null>, text: string, opts: PlayOptions): Promise<PlayResult> {
    // A newer line replaces older ones still loading, except held ones (they play first).
    for (const q of this.queue) if (!q.hold) this.drop(q)
    let settle!: () => void
    const settled = new Promise<void>(r => { settle = r })
    const pb: Playback = { id: ++this.nextId, abort: new AbortController(), hold: !!opts.hold, source: null, gain: null, started: false, done: false, settled, settle }
    this.queue.push(pb)

    let buffer: AudioBuffer | null = null
    try { buffer = await load(pb.abort.signal) } catch (e) { if (!pb.abort.signal.aborted) console.warn('[voice] load failed', e) }
    if (pb.abort.signal.aborted) return 'interrupted'
    if (!buffer) { this.drop(pb); return 'failed' }

    // Wait for held lines ahead of this one, and for a held line that is playing.
    for (;;) {
      const ahead = this.queue.slice(0, this.queue.indexOf(pb)).find(q => q.hold)
      const blocker = ahead ?? (this.current?.hold && !this.current.done ? this.current : null)
      if (!blocker) break
      await blocker.settled
      if (pb.abort.signal.aborted) return 'interrupted'
    }

    this.queue = this.queue.filter(q => q !== pb)
    if (this.current) this.stopPlayback(this.current, { interrupted: true, fadeMs: 60, node: null })
    const ctx = this.context()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    if (this.lipsync) gain.connect(this.lipsync.input)
    pb.source = source
    pb.gain = gain
    this.current = pb

    return new Promise<PlayResult>((resolve) => {
      source.onended = () => {
        this.finish(pb, { interrupted: false, node: 'idle' })
        resolve('ended')
      }
      pb.abort.signal.addEventListener('abort', () => resolve('interrupted'), { once: true })
      source.start()
      pb.started = true
      voiceState.speaking = true
      setVadEchoMode(true)
      this.lipsync?.start()
      bus.emit('tts:start', { text })
      bus.emit('character:node', { node: 'speaking' })
    })
  }

  /** Cancels a line that has not started yet. */
  private drop(pb: Playback): void {
    pb.abort.abort()
    pb.done = true
    this.queue = this.queue.filter(q => q !== pb)
    pb.settle()
  }

  /**
   * Stops the current line (fade, then stop) and cancels lines still loading. Emits
   * `tts:end` only when audio had started. `node` is the character node to set afterwards
   * (null: leave it).
   */
  stop(opts: { interrupted: boolean, fadeMs: number, node: NodeAfter }): void {
    for (const q of [...this.queue]) this.drop(q)
    if (this.current) this.stopPlayback(this.current, opts)
  }

  private stopPlayback(pb: Playback, opts: { interrupted: boolean, fadeMs: number, node: NodeAfter }): void {
    if (pb.done) return
    pb.abort.abort()
    const { source, gain } = pb
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
    this.finish(pb, opts)
  }

  private finish(pb: Playback, opts: { interrupted: boolean, node: NodeAfter }): void {
    if (pb.done) return
    pb.done = true
    if (this.current === pb) this.current = null
    pb.settle()
    if (!pb.started) return
    this.lipsync?.stop()
    voiceState.speaking = false
    setVadEchoMode(false)
    bus.emit('tts:end', { interrupted: opts.interrupted })
    if (opts.node) bus.emit('character:node', { node: opts.node })
  }
}
