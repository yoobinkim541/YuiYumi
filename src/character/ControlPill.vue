<script setup lang="ts">
// Pill-shaped control panel under the avatar. It also hides the edge where the model
// is cut below the waist. Pictogram buttons: talk (hold), VAD, screen watching, sound,
// settings, and a keyboard button that opens a small text chat input above the pill.
import { computed, nextTick, ref } from 'vue'
import { bus } from '@/core/bus'
import { closeWindow, desktop, focusWindow } from '@/desktop/windows'
import { formatShortcut, isMacPlatform } from '@/settings/shortcut'
import { useSettings } from '@/stores/settings'
import { useCharacterStore } from './store'
import { currentStatus, pttDown, pttUp, setVadEnabled, unlockAudio, voiceState } from '@/voice'

const settings = useSettings()
const character = useCharacterStore()
const watching = computed(() => settings.mode === 'active')

const LABELS = {
  'ko': { talk: '누르고 말하기', vad: 'VAD (자동 음성 감지)', watch: '화면 보기', sound: '소리', settings: '설정', chat: '채팅으로 말하기', placeholder: '메시지 입력 후 Enter (Esc 닫기)' },
  'ja': { talk: '押して話す', vad: 'VAD（音声自動検出）', watch: '画面を見る', sound: 'サウンド', settings: '設定', chat: 'チャットで話す', placeholder: '入力して Enter（Esc で閉じる）' },
  'en': { talk: 'Hold to talk', vad: 'VAD (voice detection)', watch: 'Watch screen', sound: 'Sound', settings: 'Settings', chat: 'Type a message', placeholder: 'Type and press Enter (Esc to close)' },
  'zh-Hans': { talk: '按住说话', vad: 'VAD（语音检测）', watch: '查看屏幕', sound: '声音', settings: '设置', chat: '文字聊天', placeholder: '输入后按 Enter（Esc 关闭）' },
  'zh-Hant': { talk: '按住說話', vad: 'VAD（語音偵測）', watch: '查看螢幕', sound: '聲音', settings: '設定', chat: '文字聊天', placeholder: '輸入後按 Enter（Esc 關閉）' },
} as const
const L = computed(() => LABELS[settings.lang] ?? LABELS.en)
const onOff = (on: boolean) => (on ? ' · ON' : ' · OFF')
/** Talk tooltip with the push-to-talk shortcut, e.g. "누르고 말하기 (Space)". */
const talkTip = computed(() => `${L.value.talk} (${formatShortcut(settings.pttKey, isMacPlatform())})`)
const status = computed(() => currentStatus())

function talkDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  unlockAudio()
  void pttDown()
}
function talkUp() {
  pttUp()
}
function toggleVad() {
  unlockAudio()
  void setVadEnabled(!voiceState.vadEnabled)
}
function toggleWatching() {
  settings.mode = watching.value ? 'quiet' : 'active'
}
/** Settings button toggles the window: a second press closes it. */
const settingsOpen = computed(() => desktop.windows.settings.open)
function toggleSettings() {
  if (settingsOpen.value) closeWindow('settings')
  else focusWindow('settings')
}
function toggleSound() {
  unlockAudio()
  settings.sound = !settings.sound
}

const chatOpen = ref(false)
const chatText = ref('')
const chatInput = ref<HTMLInputElement | null>(null)

function toggleChat() {
  unlockAudio()
  chatOpen.value = !chatOpen.value
  if (chatOpen.value) void nextTick(() => chatInput.value?.focus())
}

/** A typed message takes the same path as a spoken one (and wakes quiet mode the same way). */
function sendChat() {
  const text = chatText.value.trim()
  if (!text) return
  chatText.value = ''
  bus.emit('thinking', { on: true })
  bus.emit('voice:transcript', { text, confidence: 1, lang: settings.lang, source: 'chat' })
}

function onChatKey(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Enter') { e.preventDefault(); sendChat() }
  else if (e.key === 'Escape') { e.preventDefault(); chatOpen.value = false }
}
</script>

<template>
  <div class="pill" :data-character="character.character" data-no-capture @pointerdown.stop>
    <button
      type="button"
      class="pb"
      :class="{ on: voiceState.recording }"
      :data-tip="talkTip"
      :aria-label="talkTip"
      @pointerdown="talkDown"
      @pointerup="talkUp"
      @pointercancel="talkUp"
    >
      <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>
    </button>
    <button
      type="button"
      class="pb"
      :class="{ on: voiceState.vadEnabled }"
      :data-tip="L.vad + onOff(voiceState.vadEnabled)"
      :aria-pressed="voiceState.vadEnabled"
      :aria-label="L.vad"
      @click="toggleVad"
    >
      <svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h0" /></svg>
    </button>
    <button
      type="button"
      class="pb"
      :class="{ on: watching }"
      :data-tip="L.watch + onOff(watching)"
      :aria-pressed="watching"
      :aria-label="L.watch"
      @click="toggleWatching"
    >
      <svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
    <button
      type="button"
      class="pb"
      :class="{ on: settings.sound }"
      :data-tip="L.sound + onOff(settings.sound)"
      :aria-pressed="settings.sound"
      :aria-label="L.sound"
      @click="toggleSound"
    >
      <svg v-if="settings.sound" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
      <svg v-else viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 10l4 4M20 10l-4 4" /></svg>
    </button>
    <button type="button" class="pb chat-btn" :class="{ on: chatOpen }" :data-tip="L.chat" :aria-label="L.chat" :aria-pressed="chatOpen" @click="toggleChat">
      <svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9" /></svg>
    </button>
    <button type="button" class="pb" :class="{ on: settingsOpen }" :data-tip="L.settings" :aria-label="L.settings" :aria-pressed="settingsOpen" @click="toggleSettings">
      <svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
    <span class="status" :data-status="status" />
    <form v-if="chatOpen" class="chat" @submit.prevent="sendChat">
      <input
        ref="chatInput"
        v-model="chatText"
        class="chat-input"
        type="text"
        :placeholder="L.placeholder"
        :lang="settings.lang"
        maxlength="500"
        spellcheck="false"
        autocomplete="off"
        @keydown="onChatKey"
      >
      <button type="submit" class="chat-send" :disabled="!chatText.trim()" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
      </button>
    </form>
  </div>
</template>

<style scoped>
.pill {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  gap: 6px;
  /* Wide enough to cover the sleeves where the model is cut. */
  min-width: 90%;
  height: 56px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 30px rgba(40, 24, 70, 0.22), 0 1px 3px rgba(40, 24, 70, 0.12);
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  pointer-events: auto;
  cursor: default;
}
/* Per-character colors: Yumi (TT2.0) a soft gray, Yui a soft pink. */
.pill[data-character='tt2'] {
  background: linear-gradient(180deg, #ffffff 0%, #f6f6f8 45%, #e2e2e7 78%, #cbcbd2 100%);
  border-color: rgba(236, 236, 240, 0.95);
}
.pill[data-character='yui'] {
  background: linear-gradient(180deg, #ffffff 0%, #fff3f6 45%, #fbd7e2 78%, #f6b8cb 100%);
  border-color: rgba(255, 232, 239, 0.95);
}
.pb {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #6b6178;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.pb:hover { background: rgba(74, 63, 92, 0.08); color: #3c3349; }
.pb:active { transform: scale(0.94); }
.pb.on { background: rgba(255, 106, 140, 0.16); color: #e2456f; }
.pb { position: relative; }
/* Name tooltip above the icon. */
.pb[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translate(-50%, 4px);
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(38, 32, 48, 0.92);
  color: #fff;
  font: 600 12px/1.3 system-ui, -apple-system, sans-serif;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s, transform 0.12s;
}
.pb[data-tip]:hover::after { opacity: 1; transform: translate(-50%, 0); }
.pb svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.chat {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12px);
  transform: translateX(-50%);
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 10px 30px rgba(40, 24, 70, 0.22), 0 1px 3px rgba(40, 24, 70, 0.12);
}
.chat-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: 500 16px/1.4 system-ui, -apple-system, sans-serif;
  color: #2b2433;
}
.chat-send {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #e2456f;
  color: #fff;
  cursor: pointer;
}
.chat-send:disabled { background: #d9d3e0; cursor: default; }
.chat-send svg { width: 18px; height: 18px; fill: currentColor; stroke: none; }
.status {
  position: absolute;
  top: 7px;
  right: 16px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c9c3d6;
}
.status[data-status='listening'] { background: #7aa7ff; }
.status[data-status='recording'] { background: #ff5a7a; }
.status[data-status='transcribing'] { background: #f5c451; }
.status[data-status='speaking'] { background: #9be38f; }
</style>
