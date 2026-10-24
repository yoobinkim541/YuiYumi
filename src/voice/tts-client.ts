// Fetches synthesized speech from /api/tts. Returns null when TTS is unavailable
// (503 unconfigured, 429 budget, provider error, abort); the bubble stays text-only.

import type { SpeechRequest } from '@shared/contracts'
import { apiUrl } from '@/core/api'

export async function fetchSpeech(req: SpeechRequest, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(apiUrl('/api/tts'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    if (!res.ok) {
      if (res.status !== 503) console.warn('[voice] tts failed', res.status)
      return null
    }
    const buf = await res.arrayBuffer()
    return buf.byteLength > 0 ? buf : null
  } catch (e) {
    if (!signal.aborted) console.warn('[voice] tts error', e)
    return null
  }
}
