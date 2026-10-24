<script setup lang="ts">
// Observing indicator. Placed bottom-left: the character occupies the bottom-right corner.
// One click toggles active <-> quiet (stops/resumes screen capture).
import { computed } from 'vue'
import type { Lang } from '@shared/languages'
import { toggledMode } from '@/nunchi/mode'
import { nunchiStatus } from '@/nunchi/scheduler'
import { useSettings } from '@/stores/settings'

const settings = useSettings()

const LABELS: Record<Lang, { on: string, off: string, hintOn: string, hintOff: string }> = {
  'en': { on: 'Watching screen', off: 'Paused', hintOn: 'Click to pause', hintOff: 'Click to resume' },
  'ja': { on: '画面を見ています', off: '一時停止中', hintOn: 'クリックで停止', hintOff: 'クリックで再開' },
  'ko': { on: '화면 보는 중', off: '일시정지', hintOn: '클릭하면 중지', hintOff: '클릭하면 재개' },
  'zh-Hans': { on: '正在观看屏幕', off: '已暂停', hintOn: '点击暂停', hintOff: '点击继续' },
  'zh-Hant': { on: '正在觀看螢幕', off: '已暫停', hintOn: '點擊暫停', hintOff: '點擊繼續' },
}

const on = computed(() => settings.mode === 'active')
const t = computed(() => LABELS[settings.lang] ?? LABELS.en)

function toggle() {
  settings.mode = toggledMode(settings.mode)
}
</script>

<template>
  <button
    class="obs"
    :class="{ on }"
    type="button"
    :title="on ? t.hintOn : t.hintOff"
    :data-status="nunchiStatus.last"
    @click="toggle"
  >
    <span class="dot" :class="{ busy: on && nunchiStatus.inFlight }" />
    <span class="label">{{ on ? t.on : t.off }}</span>
    <span v-if="on" class="dwell">{{ nunchiStatus.dwellSec }}s</span>
  </button>
</template>

<style scoped>
.obs {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(17, 24, 39, 0.78);
  color: #f9fafb;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
.obs:hover { background: rgba(17, 24, 39, 0.92); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #9ca3af; }
.obs.on .dot { background: #ef4444; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); animation: pulse 2s infinite; }
.dot.busy { background: #f59e0b !important; }
.dwell { font-variant-numeric: tabular-nums; opacity: 0.6; font-size: 12px; }
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
</style>
