// Sends a 16 kHz utterance to /api/stt and emits the transcript on the bus.

import { TranscriptSchema, type Transcript } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { bus } from '@/core/bus'
import { voiceState } from './state'
import { encodeWav16, STT_SAMPLE_RATE } from './wav'

export type SpeechSource = 'vad' | 'ptt'

export interface SttContext {
  lang: Lang
  sessionId: string
}

/** Posts the audio; never throws. On failure the transcript is empty. */
export async function transcribe(samples16k: Float32Array, ctx: SttContext): Promise<Transcript> {
  const empty: Transcript = { text: '', confidence: null, lang: ctx.lang }
  const wav = encodeWav16(samples16k, STT_SAMPLE_RATE)
  const qs = new URLSearchParams({ lang: ctx.lang, sessionId: ctx.sessionId })
  voiceState.transcribing++
  try {
    const res = await fetch(`/api/stt?${qs}`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    })
    if (!res.ok) {
      console.warn('[voice] stt failed', res.status)
      return empty
    }
    const parsed = TranscriptSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : empty
  } catch (e) {
    console.warn('[voice] stt error', e)
    return empty
  } finally {
    voiceState.transcribing--
  }
}

/** Transcribes and always emits `voice:transcript`, also for empty text (wake rule). */
export async function transcribeAndEmit(samples16k: Float32Array | null, source: SpeechSource, ctx: SttContext): Promise<void> {
  const t = samples16k ? await transcribe(samples16k, ctx) : { text: '', confidence: null, lang: ctx.lang }
  bus.emit('voice:transcript', { ...t, source })
}
