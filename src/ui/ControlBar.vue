<script setup lang="ts">
// Track C: language, sound, mode, VAD toggle, hold-to-talk, voice status.
import { computed } from 'vue'
import { LANG_INFO, LANGS } from '@shared/languages'
import { useSettings, type AssistantMode } from '@/stores/settings'
import { currentStatus, pttDown, pttUp, setVadEnabled, unlockAudio, voiceState } from '@/voice'

const settings = useSettings()

const MODES: { value: AssistantMode, label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'ornamental', label: 'Ornamental' },
]

const STATUS_LABEL = {
  idle: 'Hold Space to talk',
  listening: 'Listening',
  recording: 'Recording',
  transcribing: 'Transcribing',
  speaking: 'Speaking',
} as const

const status = computed(() => currentStatus())
const statusText = computed(() => {
  if (voiceState.error) return voiceState.error
  if (voiceState.vadLoading) return 'Loading VAD'
  return STATUS_LABEL[status.value]
})

function onPress(e: PointerEvent) {
  unlockAudio()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  void pttDown()
}

function onRelease() {
  pttUp()
}

function toggleVad() {
  unlockAudio()
  void setVadEnabled(!voiceState.vadEnabled)
}
</script>

<template>
  <div class="control-bar" role="toolbar" aria-label="Assistant controls">
    <select v-model="settings.lang" class="ctl" aria-label="Language">
      <option v-for="code in LANGS" :key="code" :value="code">{{ LANG_INFO[code].label }}</option>
    </select>

    <select v-model="settings.mode" class="ctl" aria-label="Mode">
      <option v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
    </select>

    <button
      type="button"
      class="ctl toggle"
      :aria-pressed="settings.sound"
      :title="settings.sound ? 'Sound on' : 'Sound off'"
      @click="settings.sound = !settings.sound; unlockAudio()"
    >
      {{ settings.sound ? 'Sound on' : 'Muted' }}
    </button>

    <button
      type="button"
      class="ctl toggle"
      :aria-pressed="voiceState.vadEnabled"
      :disabled="voiceState.vadLoading"
      title="Hands-free voice detection"
      @click="toggleVad"
    >
      VAD {{ voiceState.vadEnabled ? 'on' : 'off' }}
    </button>

    <button
      type="button"
      class="ctl talk"
      :class="{ recording: voiceState.recording }"
      :aria-pressed="voiceState.recording"
      title="Hold to talk (or hold Space)"
      @pointerdown.prevent="onPress"
      @pointerup="onRelease"
      @pointercancel="onRelease"
      @keydown.space.prevent
      @contextmenu.prevent
    >
      <span class="dot" aria-hidden="true" />
      {{ voiceState.recording ? 'Release to send' : 'Hold to talk' }}
    </button>

    <span class="status" :data-status="status" aria-live="polite">{{ statusText }}</span>
  </div>
</template>

<style scoped>
.control-bar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(20, 22, 30, 0.72);
  backdrop-filter: blur(8px);
  color: #f2f2f5;
  font: 12px/1.2 system-ui, sans-serif;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  user-select: none;
  white-space: nowrap;
}
.ctl {
  height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ctl:hover { background: rgba(255, 255, 255, 0.16); }
.ctl:disabled { opacity: 0.5; cursor: progress; }
select.ctl option { color: #111; }
.toggle[aria-pressed='true'] { background: rgba(120, 170, 255, 0.28); border-color: rgba(140, 180, 255, 0.6); }
.talk { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 122px; touch-action: none; }
.talk .dot { width: 8px; height: 8px; border-radius: 50%; background: #8a8f9c; }
.talk.recording { background: rgba(255, 80, 80, 0.3); border-color: rgba(255, 110, 110, 0.8); }
.talk.recording .dot { background: #ff4d4d; animation: pulse 0.9s ease-in-out infinite; }
.status { min-width: 92px; padding: 0 4px; opacity: 0.85; }
.status[data-status='recording'] { color: #ff9b9b; }
.status[data-status='transcribing'] { color: #ffd88a; }
.status[data-status='speaking'] { color: #9fd3ff; }
@keyframes pulse { 50% { opacity: 0.35; } }
</style>
