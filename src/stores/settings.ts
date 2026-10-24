import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { VoicePreset } from '@shared/contracts'
import { DEFAULT_LANG, type Lang } from '@shared/languages'
import { DEFAULT_PTT, parseShortcut, type Shortcut } from '@/settings/shortcut'

/** active: observes the screen. quiet / ornamental: no capture, no observer calls. */
export type AssistantMode = 'active' | 'quiet' | 'ornamental'

const KEY = 'yuiyumi.settings'

export const useSettings = defineStore('settings', () => {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<{ lang: Lang, sound: boolean, mode: AssistantMode, pttKey: unknown, voicePreset: VoicePreset }>
  const lang = ref<Lang>(saved.lang ?? DEFAULT_LANG)
  const sound = ref<boolean>(saved.sound ?? true)
  const mode = ref<AssistantMode>(saved.mode ?? 'active')
  /** Push-to-talk shortcut (KeyboardEvent.code plus modifiers). Replace the object to change it. */
  const pttKey = ref<Shortcut>(parseShortcut(saved.pttKey) ?? { ...DEFAULT_PTT })
  /** TTS voice style; lively is the default. */
  const voicePreset = ref<VoicePreset>(saved.voicePreset ?? 'lively')
  const sessionId = crypto.randomUUID()

  watch([lang, sound, mode, pttKey, voicePreset], () => {
    localStorage.setItem(KEY, JSON.stringify({ lang: lang.value, sound: sound.value, mode: mode.value, pttKey: pttKey.value, voicePreset: voicePreset.value }))
  }, { deep: true })

  return { lang, sound, mode, pttKey, voicePreset, sessionId }
})
