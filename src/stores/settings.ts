import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { AGENT_MODELS, PERMISSION_LEVELS, type AgentModel, type PermissionLevel, type VoicePreset } from '@shared/contracts'
import { DEFAULT_LANG, LANG_INFO, LANGS, type Lang } from '@shared/languages'
import { DEFAULT_PTT, parseShortcut, type Shortcut } from '@/settings/shortcut'

/** active: observes the screen. quiet / ornamental: no capture, no observer calls. */
export type AssistantMode = 'active' | 'quiet' | 'ornamental'

export const USER_NAME_MAX = 30

const KEY = 'yuiyumi.settings'

/** First-visit language from the browser; Taiwan and Hong Kong map to Traditional Chinese. */
function browserLang(): Lang {
  const tag = (navigator.language || '').toLowerCase()
  if (tag.startsWith('zh')) return /tw|hk|mo|hant/.test(tag) ? 'zh-Hant' : 'zh-Hans'
  const base = tag.split('-')[0] as Lang
  return LANGS.includes(base) ? base : DEFAULT_LANG
}

export const useSettings = defineStore('settings', () => {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<{ lang: Lang, sound: boolean, mode: AssistantMode, pttKey: unknown, voicePreset: VoicePreset, permission: PermissionLevel, voiceLang: Lang | null, userName: string, welcomed: boolean, agentModel: AgentModel, agentProjectDir: string }>
  const lang = ref<Lang>(LANGS.includes(saved.lang as Lang) ? saved.lang! : browserLang())
  const sound = ref<boolean>(saved.sound ?? true)
  const mode = ref<AssistantMode>(saved.mode ?? 'active')
  /** Push-to-talk shortcut (KeyboardEvent.code plus modifiers). Replace the object to change it. */
  const pttKey = ref<Shortcut>(parseShortcut(saved.pttKey) ?? { ...DEFAULT_PTT })
  /** TTS voice style; lively is the default. */
  const voicePreset = ref<VoicePreset>(saved.voicePreset ?? 'lively')
  /** How much the agent may do without asking (see requiresConfirmation). Default manual. */
  const permission = ref<PermissionLevel>(PERMISSION_LEVELS.includes(saved.permission as PermissionLevel) ? saved.permission! : 'manual')
  /** Speech language (STT, replies, TTS). null follows the UI language. */
  const voiceLang = ref<Lang | null>(LANGS.includes(saved.voiceLang as Lang) ? saved.voiceLang! : null)
  const speechLang = computed<Lang>(() => voiceLang.value ?? lang.value)
  /** What the character calls the user (asked on the first visit). Empty: no name. */
  const userName = ref<string>(typeof saved.userName === 'string' ? saved.userName.slice(0, USER_NAME_MAX) : '')
  /** First-visit welcome done (name asked, audio unlocked by the start click). */
  const welcomed = ref<boolean>(saved.welcomed === true)
  /** Model that runs tasks; screen watching always uses Haiku. */
  const agentModel = ref<AgentModel>(AGENT_MODELS.includes(saved.agentModel as AgentModel) ? saved.agentModel! : 'sonnet')
  /** Desktop app: absolute folder the coding agent works in (chosen with the folder picker). Empty: none. */
  const agentProjectDir = ref<string>(typeof saved.agentProjectDir === 'string' ? saved.agentProjectDir : '')
  const sessionId = crypto.randomUUID()

  // CJK glyph selection follows <html lang>.
  watch(lang, l => { document.documentElement.lang = LANG_INFO[l].bcp47 }, { immediate: true })

  watch([lang, sound, mode, pttKey, voicePreset, permission, voiceLang, userName, welcomed, agentModel, agentProjectDir], () => {
    localStorage.setItem(KEY, JSON.stringify({ lang: lang.value, sound: sound.value, mode: mode.value, pttKey: pttKey.value, voicePreset: voicePreset.value, permission: permission.value, voiceLang: voiceLang.value, userName: userName.value, welcomed: welcomed.value, agentModel: agentModel.value, agentProjectDir: agentProjectDir.value }))
  }, { deep: true })

  return { lang, sound, mode, pttKey, voicePreset, permission, voiceLang, speechLang, userName, welcomed, agentModel, agentProjectDir, sessionId }
})
