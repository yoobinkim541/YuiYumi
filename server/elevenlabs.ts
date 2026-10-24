// ElevenLabs streaming TTS over plain REST. Returns the mp3 body stream as-is.

import type { VoicePreset } from '../shared/contracts.js'
import { LANG_INFO, type Lang } from '../shared/languages.js'
import { env } from './http.js'
import { ProviderError, ProviderUnconfiguredError, type TtsProvider } from './voice-providers.js'

/**
 * Voice style presets (model + voice settings). All cover en/ja/ko/zh; check GET /v1/models
 * before changing model ids. ELEVENLABS_MODEL, when set, replaces the lively preset's model.
 */
const PRESETS: Record<VoicePreset, { model: () => string, settings?: Record<string, number | boolean> }> = {
  // About 0.6 s per line; livelier than the voice defaults so lines sound spoken to the user.
  lively: {
    model: () => env('ELEVENLABS_MODEL') ?? 'eleven_v4_turbo',
    settings: { stability: 0.3, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.05 },
  },
  // Most natural delivery, about 3-4 s per line.
  conversational: { model: () => 'eleven_v3_conversational' },
  // Fastest (about 0.4 s) but flatter.
  fast: { model: () => 'eleven_flash_v2_5' },
}
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

    const preset = PRESETS[req.preset ?? 'lively']
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`)
    url.searchParams.set('output_format', OUTPUT_FORMAT)

    const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: req.text,
        model_id: preset.model(),
        language_code: ISO639[req.lang],
        ...(preset.settings ? { voice_settings: preset.settings } : {}),
      }),
      signal: AbortSignal.any(signals),
    })
    if (!res.ok || !res.body) {
      throw new ProviderError(`elevenlabs ${res.status}`, res.status)
    }
    return res.body
  },
}
