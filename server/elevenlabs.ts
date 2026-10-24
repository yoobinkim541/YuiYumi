// ElevenLabs streaming TTS over plain REST. Returns the mp3 body stream as-is.

import { LANG_INFO, type Lang } from '../shared/languages'
import { env } from './http'
import { ProviderError, ProviderUnconfiguredError, type TtsProvider } from './voice-providers'

/**
 * Multilingual model with a conversational delivery at about one second per line (covers
 * en/ja/ko/zh). Override with ELEVENLABS_MODEL after checking GET /v1/models.
 */
const DEFAULT_MODEL = 'eleven_v4_turbo'

/** Livelier than the voice defaults (0.5 stability, no style), so lines sound spoken to the user. */
const VOICE_SETTINGS = { stability: 0.3, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.05 }
const OUTPUT_FORMAT = 'mp3_44100_128'
const TIMEOUT_MS = 20_000

/** ISO 639-1 code for `language_code`; ignored by models that do not support it. */
const ISO639: Record<Lang, string> = { 'en': 'en', 'ja': 'ja', 'ko': 'ko', 'zh-Hans': 'zh', 'zh-Hant': 'zh' }

/**
 * Voice id for a request: the character's own voice (ELEVENLABS_VOICE_TT2 / _YUI) speaks
 * every language through the multilingual model; the per-language voice is the fallback.
 */
export function voiceIdFor(lang: Lang, character?: string): string | undefined {
  return (character ? env(`ELEVENLABS_VOICE_${character.toUpperCase()}`) : undefined)
    ?? env(LANG_INFO[lang].elevenVoiceEnv)
}

export const elevenLabsTts: TtsProvider = {
  isConfigured(lang, character) {
    return !!env('ELEVENLABS_API_KEY') && !!voiceIdFor(lang, character)
  },

  async synthesize(req, signal) {
    const key = env('ELEVENLABS_API_KEY')
    if (!key) throw new ProviderUnconfiguredError('ELEVENLABS_API_KEY')
    const voiceId = voiceIdFor(req.lang, req.character)
    if (!voiceId) throw new ProviderUnconfiguredError(LANG_INFO[req.lang].elevenVoiceEnv)

    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`)
    url.searchParams.set('output_format', OUTPUT_FORMAT)

    const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: req.text,
        model_id: env('ELEVENLABS_MODEL') ?? DEFAULT_MODEL,
        language_code: ISO639[req.lang],
        voice_settings: VOICE_SETTINGS,
      }),
      signal: AbortSignal.any(signals),
    })
    if (!res.ok || !res.body) {
      throw new ProviderError(`elevenlabs ${res.status}`, res.status)
    }
    return res.body
  },
}
