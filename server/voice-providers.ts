// Provider-neutral voice interfaces. api/stt.ts and api/tts.ts only see these, so the
// Deepgram / ElevenLabs implementations can be swapped (e.g. streaming STT) without
// touching the routes or the browser.

import type { Lang } from '../shared/languages'
import type { SpeechRequest, Transcript } from '../shared/contracts'

export interface SttProvider {
  /** `wav` is a 16 kHz mono 16-bit PCM WAV file. */
  transcribe(wav: ArrayBuffer, lang: Lang): Promise<Transcript>
}

export interface TtsProvider {
  /** Cheap local check (keys, per-language voice) so routes can answer 503 before spending budget. */
  isConfigured(lang: Lang, character?: string): boolean
  /** Resolves to audio/mpeg bytes, streamed when the provider supports it. */
  synthesize(req: SpeechRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array> | ArrayBuffer>
}

/** Thrown when a provider is missing its key or per-language configuration. */
export class ProviderUnconfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured`)
    this.name = 'ProviderUnconfiguredError'
  }
}

/** Thrown when the upstream provider answered with an error. `status` is the upstream status. */
export class ProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ProviderError'
  }
}
