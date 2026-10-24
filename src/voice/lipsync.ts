// Lip sync for TTS playback. wLipSync (MFCC visemes, AudioWorklet) when it loads,
// otherwise an AnalyserNode RMS envelope. Emits `character:mouth` once per animation
// frame while playing and `null` when stopped.
// The wLipSync profile (lipsync-profile.json) comes from AIRI's model-driver-lipsync (MIT).

import type { Profile, WLipSyncAudioNode } from 'wlipsync'
import { bus } from '@/core/bus'
import { createMouthEnvelope, volumeFromRms } from './mouth'
import profileJson from './lipsync-profile.json'

export class LipSync {
  /** Connect the playback signal here (analysis only; produces no sound). */
  readonly input: GainNode
  private readonly analyser: AnalyserNode
  private readonly buf: Float32Array<ArrayBuffer>
  private wlip: WLipSyncAudioNode | null = null
  private readonly envelope = createMouthEnvelope()
  private raf = 0
  private last = 0

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain()
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.buf = new Float32Array(this.analyser.fftSize)
    this.input.connect(this.analyser)
    void this.loadWLipSync()
  }

  private async loadWLipSync(): Promise<void> {
    try {
      const { createWLipSyncNode } = await import('wlipsync')
      const node = await createWLipSyncNode(this.ctx, profileJson as unknown as Profile)
      this.input.connect(node)
      this.wlip = node
    } catch (e) {
      console.warn('[voice] wlipsync unavailable, using RMS lip sync', e)
    }
  }

  private read(): { volume: number, weights: WLipSyncAudioNode['weights'] | null } {
    if (this.wlip) return { volume: this.wlip.volume, weights: this.wlip.weights }
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!
    return { volume: volumeFromRms(Math.sqrt(sum / this.buf.length)), weights: null }
  }

  start(): void {
    this.stop(false)
    this.envelope.reset()
    this.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      const { volume, weights } = this.read()
      bus.emit('character:mouth', { open: this.envelope.update(volume, weights, dt) })
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(emitNull = true): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    const wasRunning = this.raf !== 0
    this.raf = 0
    if (emitNull && wasRunning) bus.emit('character:mouth', null)
  }
}
