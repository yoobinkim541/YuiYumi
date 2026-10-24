// Optional hands-free input: Silero VAD (@ricky0123/vad-web) on the shared mic stream.
// vad-web is CommonJS-only, so its UMD bundle and onnxruntime-web are loaded from /vad/
// (copied by scripts/copy-vad-assets.mjs) with <script> tags; only its types are imported.

import type { MicVAD, RealTimeVADOptions } from '@ricky0123/vad-web'
import { bus } from '@/core/bus'
import { getCaptureContext, getMicStream } from './mic'
import { voiceState } from './state'
import { transcribeAndEmit, type SttContext } from './stt-client'

const ASSET_BASE = `${import.meta.env.BASE_URL}vad/`

export const VAD_THRESHOLDS = {
  normal: { positiveSpeechThreshold: 0.6, negativeSpeechThreshold: 0.35 },
  /** While TTS plays, speaker echo can leak into the mic. */
  echo: { positiveSpeechThreshold: 0.85, negativeSpeechThreshold: 0.35 },
} as const

interface VadGlobal { MicVAD: { new: (o: Partial<RealTimeVADOptions>) => Promise<MicVAD> } }

let vad: MicVAD | null = null
let loading: Promise<MicVAD> | null = null
let echoMode = false
let getCtx: () => SttContext = () => { throw new Error('vad not initialised') }
/** Push-to-talk owns the mic while held; VAD callbacks are ignored then. */
let isSuppressed: () => boolean = () => false

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-yy-src="${src}"]`)
  if (existing) return existing.dataset.loaded ? Promise.resolve() : new Promise((ok, ko) => {
    existing.addEventListener('load', () => ok())
    existing.addEventListener('error', () => ko(new Error(`failed to load ${src}`)))
  })
  return new Promise((ok, ko) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.yySrc = src
    s.onload = () => { s.dataset.loaded = '1'; ok() }
    s.onerror = () => ko(new Error(`failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function loadVadGlobal(): Promise<VadGlobal> {
  await loadScript(`${ASSET_BASE}ort.wasm.min.js`)
  await loadScript(`${ASSET_BASE}vad.bundle.min.js`)
  const g = (window as unknown as { vad?: VadGlobal }).vad
  if (!g?.MicVAD) throw new Error('vad global missing')
  return g
}

async function createVad(): Promise<MicVAD> {
  const { MicVAD } = await loadVadGlobal()
  const stream = await getMicStream()
  return MicVAD.new({
    model: 'v5',
    baseAssetPath: ASSET_BASE,
    onnxWASMBasePath: ASSET_BASE,
    audioContext: getCaptureContext(),
    // Share the push-to-talk stream; never stop its tracks from here.
    getStream: async () => stream,
    pauseStream: async () => {},
    resumeStream: async () => stream,
    ...(echoMode ? VAD_THRESHOLDS.echo : VAD_THRESHOLDS.normal),
    preSpeechPadMs: 300,
    redemptionMs: 600,
    minSpeechMs: 250,
    startOnLoad: false,
    ortConfig: (ort) => { ort.env.logLevel = 'error' },
    onSpeechRealStart: () => {
      if (isSuppressed()) return
      voiceState.vadSpeaking = true
      bus.emit('voice:speech-start', { source: 'vad' })
    },
    onVADMisfire: () => { voiceState.vadSpeaking = false },
    onSpeechEnd: (audio: Float32Array) => {
      const wasSpeaking = voiceState.vadSpeaking
      voiceState.vadSpeaking = false
      if (!wasSpeaking || isSuppressed()) return
      bus.emit('voice:speech-end', { source: 'vad' })
      void transcribeAndEmit(audio, 'vad', getCtx())
    },
  })
}

export function configureVad(ctx: () => SttContext, suppressed: () => boolean): void {
  getCtx = ctx
  isSuppressed = suppressed
}

/** Turns VAD on or off. Enabling must happen from a user gesture (mic permission). */
export async function setVadEnabled(on: boolean): Promise<void> {
  voiceState.vadEnabled = on
  voiceState.error = null
  if (!on) {
    if (voiceState.vadSpeaking) {
      voiceState.vadSpeaking = false
      bus.emit('voice:speech-end', { source: 'vad' })
    }
    await vad?.pause()
    return
  }
  try {
    if (!vad) {
      voiceState.vadLoading = true
      loading ??= createVad()
      vad = await loading
    }
    if (voiceState.vadEnabled) await vad.start()
  } catch (e) {
    console.warn('[voice] vad', e)
    loading = null
    voiceState.vadEnabled = false
    voiceState.error = 'VAD unavailable'
  } finally {
    voiceState.vadLoading = false
  }
}

/** Raises the speech threshold while TTS is playing. */
export function setVadEchoMode(on: boolean): void {
  echoMode = on
  vad?.setOptions(on ? VAD_THRESHOLDS.echo : VAD_THRESHOLDS.normal)
}
