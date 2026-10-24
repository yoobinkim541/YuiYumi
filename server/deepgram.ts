// Deepgram pre-recorded STT (Nova-3) over plain REST.

import { LANG_INFO, type Lang } from '../shared/languages'
import type { Transcript } from '../shared/contracts'
import { env } from './http'
import { ProviderError, ProviderUnconfiguredError, type SttProvider } from './voice-providers'

const ENDPOINT = 'https://api.deepgram.com/v1/listen'
const TIMEOUT_MS = 15_000

interface DeepgramListenResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string, confidence?: number }>
    }>
  }
}

/** Extracts the first alternative; empty text when Deepgram heard nothing. */
export function mapDeepgramResponse(body: DeepgramListenResponse, lang: Lang): Transcript {
  const alt = body.results?.channels?.[0]?.alternatives?.[0]
  return {
    text: (alt?.transcript ?? '').trim(),
    confidence: typeof alt?.confidence === 'number' ? alt.confidence : null,
    lang,
  }
}

export const deepgramStt: SttProvider = {
  async transcribe(wav, lang) {
    const key = env('DEEPGRAM_API_KEY')
    if (!key) throw new ProviderUnconfiguredError('DEEPGRAM_API_KEY')

    const url = new URL(ENDPOINT)
    url.searchParams.set('model', env('DEEPGRAM_MODEL') ?? 'nova-3')
    url.searchParams.set('language', LANG_INFO[lang].deepgram)
    url.searchParams.set('smart_format', 'true')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Token ${key}`, 'content-type': 'audio/wav' },
      body: wav,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      // Do not forward the upstream body: it may echo request details.
      throw new ProviderError(`deepgram ${res.status}`, res.status)
    }
    return mapDeepgramResponse(await res.json() as DeepgramListenResponse, lang)
  },
}
