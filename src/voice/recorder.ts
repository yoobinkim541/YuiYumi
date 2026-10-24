// Captures Float32 PCM from the shared mic stream. AudioWorklet when available,
// ScriptProcessor otherwise. Keeps a short pre-roll so the first syllable is not lost.

import { getCaptureContext, getMicStream } from './mic'
import { concatFloat32, resample, STT_SAMPLE_RATE } from './wav'

const PRE_ROLL_SEC = 0.3
const BATCH = 2048

const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${BATCH}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('yy-pcm-tap', PcmTap)
`

type ChunkSink = (chunk: Float32Array) => void

let tapReady: Promise<void> | null = null
let sink: ChunkSink | null = null

async function installTap(): Promise<void> {
  const ctx = getCaptureContext()
  const stream = await getMicStream()
  const source = ctx.createMediaStreamSource(stream)
  const mute = ctx.createGain()
  mute.gain.value = 0
  mute.connect(ctx.destination)
  const deliver = (chunk: Float32Array) => sink?.(chunk)

  if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }))
    try {
      await ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const node = new AudioWorkletNode(ctx, 'yy-pcm-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
    node.port.onmessage = (e: MessageEvent<Float32Array>) => deliver(e.data)
    source.connect(node).connect(mute)
  } else {
    // Deprecated but still the only fallback without AudioWorklet.
    const node = ctx.createScriptProcessor(BATCH, 1, 1)
    node.onaudioprocess = e => deliver(e.inputBuffer.getChannelData(0).slice())
    source.connect(node).connect(mute)
  }
}

/** Opens the mic and the tap once. Must be first called from a user gesture. */
export function ensureTap(): Promise<void> {
  if (!tapReady) {
    tapReady = installTap()
    tapReady.catch(() => { tapReady = null })
  }
  return tapReady
}

export class Recorder {
  private preRoll: Float32Array[] = []
  private chunks: Float32Array[] = []
  private recording = false

  constructor() {
    sink = (chunk) => {
      if (this.recording) { this.chunks.push(chunk); return }
      this.preRoll.push(chunk)
      const maxChunks = Math.ceil((PRE_ROLL_SEC * this.sampleRate) / BATCH)
      while (this.preRoll.length > maxChunks) this.preRoll.shift()
    }
  }

  get sampleRate(): number {
    return getCaptureContext().sampleRate
  }

  get isRecording(): boolean {
    return this.recording
  }

  async start(): Promise<void> {
    await ensureTap()
    this.chunks = [...this.preRoll]
    this.preRoll = []
    this.recording = true
  }

  /** Stops and returns the take resampled to 16 kHz, with its duration in seconds. */
  stop(): { samples: Float32Array, durationSec: number } {
    this.recording = false
    const raw = concatFloat32(this.chunks)
    this.chunks = []
    const rate = this.sampleRate
    return { samples: resample(raw, rate, STT_SAMPLE_RATE), durationSec: raw.length / rate }
  }

  /** Drops the take without sending it. */
  cancel(): void {
    this.recording = false
    this.chunks = []
  }
}
