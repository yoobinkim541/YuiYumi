<script setup lang="ts">
// Pill-shaped control panel under the avatar. It also hides the edge where the model
// is cut below the waist. Pictogram buttons: talk (hold), VAD, screen watching, sound,
// settings.
import { computed } from 'vue'
import { focusWindow } from '@/desktop/windows'
import { useSettings } from '@/stores/settings'
import { currentStatus, pttDown, pttUp, setVadEnabled, unlockAudio, voiceState } from '@/voice'

const settings = useSettings()
const watching = computed(() => settings.mode === 'active')
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
function toggleSound() {
  unlockAudio()
  settings.sound = !settings.sound
}
</script>

<template>
  <div class="pill" data-no-capture @pointerdown.stop>
    <button
      type="button"
      class="pb"
      :class="{ on: voiceState.recording }"
      title="Hold to talk"
      aria-label="Hold to talk"
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
      :title="voiceState.vadEnabled ? 'Voice detection on' : 'Voice detection off'"
      :aria-pressed="voiceState.vadEnabled"
      aria-label="Voice detection"
      @click="toggleVad"
    >
      <svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h0" /></svg>
    </button>
    <button
      type="button"
      class="pb"
      :class="{ on: watching }"
      :title="watching ? 'Watching the screen' : 'Not watching the screen'"
      :aria-pressed="watching"
      aria-label="Screen watching"
      @click="toggleWatching"
    >
      <svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
    <button
      type="button"
      class="pb"
      :class="{ on: settings.sound }"
      :title="settings.sound ? 'Sound on' : 'Sound off'"
      :aria-pressed="settings.sound"
      aria-label="Sound"
      @click="toggleSound"
    >
      <svg v-if="settings.sound" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
      <svg v-else viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 10l4 4M20 10l-4 4" /></svg>
    </button>
    <button type="button" class="pb" title="Settings" aria-label="Settings" @click="focusWindow('settings')">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
    </button>
    <span class="status" :data-status="status" />
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
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 30px rgba(40, 24, 70, 0.22), 0 1px 3px rgba(40, 24, 70, 0.12);
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  pointer-events: auto;
  cursor: default;
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
.pb svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
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
