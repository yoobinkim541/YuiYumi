import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { DEFAULT_LANG, type Lang } from '@shared/languages'

/** active: observes the screen. quiet / ornamental: no capture, no observer calls. */
export type AssistantMode = 'active' | 'quiet' | 'ornamental'

const KEY = 'yuiyumi.settings'

export const useSettings = defineStore('settings', () => {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<{ lang: Lang, sound: boolean, mode: AssistantMode }>
  const lang = ref<Lang>(saved.lang ?? DEFAULT_LANG)
  const sound = ref<boolean>(saved.sound ?? true)
  const mode = ref<AssistantMode>(saved.mode ?? 'active')
  const sessionId = crypto.randomUUID()

  watch([lang, sound, mode], () => {
    localStorage.setItem(KEY, JSON.stringify({ lang: lang.value, sound: sound.value, mode: mode.value }))
  })

  return { lang, sound, mode, sessionId }
})
