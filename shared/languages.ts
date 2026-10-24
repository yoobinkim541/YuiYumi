// Single source for the five supported languages. The UI language, the Deepgram STT
// language and the ElevenLabs voice are all chosen from this table.

export const LANGS = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const
export type Lang = (typeof LANGS)[number]

export interface LangInfo {
  code: Lang
  label: string
  /** Deepgram `language` query value (Nova-3). */
  deepgram: string
  /** Name of the server env var that holds the ElevenLabs voice id for this language. */
  elevenVoiceEnv: string
  /** BCP 47 tag for Intl / html lang. */
  bcp47: string
}

export const LANG_INFO: Record<Lang, LangInfo> = {
  'en': { code: 'en', label: 'English', deepgram: 'en', elevenVoiceEnv: 'ELEVENLABS_VOICE_EN', bcp47: 'en' },
  'ja': { code: 'ja', label: '日本語', deepgram: 'ja', elevenVoiceEnv: 'ELEVENLABS_VOICE_JA', bcp47: 'ja' },
  'ko': { code: 'ko', label: '한국어', deepgram: 'ko', elevenVoiceEnv: 'ELEVENLABS_VOICE_KO', bcp47: 'ko' },
  'zh-Hans': { code: 'zh-Hans', label: '简体中文', deepgram: 'zh-CN', elevenVoiceEnv: 'ELEVENLABS_VOICE_ZH_HANS', bcp47: 'zh-Hans' },
  'zh-Hant': { code: 'zh-Hant', label: '繁體中文(台灣)', deepgram: 'zh-TW', elevenVoiceEnv: 'ELEVENLABS_VOICE_ZH_HANT', bcp47: 'zh-Hant-TW' },
}

export const DEFAULT_LANG: Lang = 'ko'
