<script setup lang="ts">
// Menu bar tray item for the assistant. The icon's dot shows the observing state; the
// dropdown (assistant UI, excluded from captures) holds the quick controls that used to live
// in the page-level control bar and observing indicator.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LANG_INFO, LANGS } from '@shared/languages'
import { toggledMode } from '@/nunchi/mode'
import { nunchiStatus } from '@/nunchi/scheduler'
import { settingsStrings } from '@/settings/i18n'
import { useSettings, type AssistantMode } from '@/stores/settings'
import { setVadEnabled, unlockAudio, voiceState } from '@/voice'
import { assistantWindow, focusWindow } from './windows'

const settings = useSettings()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const MODES: AssistantMode[] = ['active', 'quiet', 'ornamental']
const S = computed(() => settingsStrings(settings.lang))
const t = computed(() => S.value.tray)

const watching = computed(() => settings.mode === 'active')

function toggleWatching() {
  settings.mode = toggledMode(settings.mode)
}

function openApp(id: 'settings' | 'dashboard') {
  focusWindow(id)
  open.value = false
}

function toggleVad() {
  unlockAudio()
  void setVadEnabled(!voiceState.vadEnabled)
}

/** Menu rows close the menu after acting, like a native status menu. */
function onMenuClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) open.value = false
}

function onDocPointerDown(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))
</script>

<template>
  <div ref="root" class="tray">
    <button
      type="button"
      class="tray-item"
      :class="{ open }"
      :title="watching ? 'YuiYumi is watching the screen' : 'YuiYumi is paused'"
      @click="open = !open"
    >
      <img src="/models/tt2-icon.png" alt="YuiYumi" draggable="false">
      <span class="tray-dot" :class="{ on: watching, busy: watching && nunchiStatus.inFlight }" />
    </button>

    <div v-if="open" class="tray-menu" data-no-capture role="menu" @click="onMenuClick">
      <div class="tm-head">
        <img src="/models/tt2-icon.png" alt="" draggable="false">
        <div>
          <strong>YuiYumi</strong>
          <span>{{ watching ? t.watching(nunchiStatus.dwellSec) : t.paused }}</span>
        </div>
      </div>
      <button type="button" class="tm-row" @click="toggleWatching">
        <span class="tm-check">{{ watching ? '✓' : '' }}</span>{{ watching ? t.pause : t.resume }}
      </button>
      <button type="button" class="tm-row" @click="assistantWindow.visible = !assistantWindow.visible">
        <span class="tm-check" />{{ assistantWindow.visible ? t.hideChar : t.showChar }}
      </button>
      <button type="button" class="tm-row" @click="settings.mode = settings.mode === 'quiet' ? 'active' : 'quiet'">
        <span class="tm-check">{{ settings.mode === 'quiet' ? '✓' : '' }}</span>{{ t.quiet }}
      </button>
      <div class="tm-sep" />
      <label class="tm-field">
        <span>{{ t.mode }}</span>
        <select v-model="settings.mode">
          <option v-for="m in MODES" :key="m" :value="m">{{ S.general.modes[m].title }}</option>
        </select>
      </label>
      <label class="tm-field">
        <span>{{ t.language }}</span>
        <select v-model="settings.lang">
          <option v-for="code in LANGS" :key="code" :value="code">{{ LANG_INFO[code].label }}</option>
        </select>
      </label>
      <button type="button" class="tm-row" @click="settings.sound = !settings.sound; unlockAudio()">
        <span class="tm-check">{{ settings.sound ? '✓' : '' }}</span>{{ t.sound }}
      </button>
      <button type="button" class="tm-row" :disabled="voiceState.vadLoading" @click="toggleVad">
        <span class="tm-check">{{ voiceState.vadEnabled ? '✓' : '' }}</span>{{ t.vad }}{{ voiceState.vadLoading ? ' ...' : '' }}
      </button>
      <div class="tm-sep" />
      <button type="button" class="tm-row" @click="openApp('settings')"><span class="tm-check" />{{ t.settings }}</button>
      <button type="button" class="tm-row" @click="openApp('dashboard')"><span class="tm-check" />{{ t.dashboard }}</button>
    </div>
  </div>
</template>

<style scoped>
.tray { position: relative; display: flex; align-items: center; }
.tray-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.tray-item:hover, .tray-item.open { background: rgba(0, 0, 0, 0.1); }
.tray-item img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; object-position: top; }
.tray-dot {
  position: absolute;
  right: 5px;
  bottom: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #f5f5f7;
  background: #9ca3af;
}
.tray-dot.on { background: #ef4444; }
.tray-dot.busy { background: #f59e0b; }
.tray-menu {
  position: absolute;
  right: 0;
  top: 38px;
  width: 330px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(246, 246, 248, 0.86);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(15, 23, 42, 0.12);
  font-size: 16px;
  color: #1f2937;
  z-index: 100002;
}
.tm-head { display: flex; align-items: center; gap: 10px; padding: 8px 10px 10px; }
.tm-head img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; object-position: top; background: #fde2e4; }
.tm-head div { display: flex; flex-direction: column; }
.tm-head span { font-size: 13px; color: #6b7280; }
.tm-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px 6px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tm-row:hover:not(:disabled) { background: #3b82f6; color: #fff; }
.tm-row:disabled { opacity: 0.5; }
.tm-check { width: 22px; text-align: center; font-size: 14px; }
.tm-sep { height: 1px; margin: 5px 8px; background: rgba(15, 23, 42, 0.12); }
.tm-field { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px 5px 26px; }
.tm-field select { font: inherit; font-size: 14px; padding: 2px 6px; border-radius: 6px; border: 1px solid rgba(15, 23, 42, 0.2); background: #fff; }
</style>
