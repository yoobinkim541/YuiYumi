<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/settings/Icon.vue'
import { closeWindow, desktop, desktopView, focusWindow, moveWindow, type AppId } from './windows'

// `unified`: the app draws its own toolbar (macOS unified title bar). The traffic lights
// float over it and any element marked [data-wf-drag] inside the app moves the window.
const props = defineProps<{ id: AppId, accent?: string, noCapture?: boolean, unified?: boolean }>()

const w = computed(() => desktop.windows[props.id])
const focused = computed(() => desktop.focused === props.id)

let drag: { px: number, py: number, x: number, y: number } | null = null

function onTitlePointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.wf-btn')) return
  focusWindow(props.id)
  drag = { px: e.clientX, py: e.clientY, x: w.value.x, y: w.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onBodyPointerDown(e: PointerEvent) {
  const t = e.target as HTMLElement
  if (!props.unified || !t.closest('[data-wf-drag]') || t.closest('button, input, textarea, select, a, [data-no-drag]')) return
  drag = { px: e.clientX, py: e.clientY, x: w.value.x, y: w.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onTitlePointerMove(e: PointerEvent) {
  if (!drag) return
  const s = desktopView.scale || 1
  moveWindow(props.id, drag.x + (e.clientX - drag.px) / s, drag.y + (e.clientY - drag.py) / s)
}

function onTitlePointerUp() {
  drag = null
}
</script>

<template>
  <section
    v-show="w.open"
    class="wf"
    :class="{ focused, assistant: noCapture, unified }"
    :data-no-capture="noCapture ? '' : undefined"
    :style="{ left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px`, zIndex: w.z }"
    @pointerdown="focusWindow(id)"
  >
    <header
      class="wf-title"
      :style="accent ? { '--accent': accent } : undefined"
      @pointerdown="onTitlePointerDown"
      @pointermove="onTitlePointerMove"
      @pointerup="onTitlePointerUp"
      @pointercancel="onTitlePointerUp"
    >
      <div class="wf-lights">
        <button class="wf-btn close" aria-label="Close" @click.stop="closeWindow(id)"><svg viewBox="0 0 10 10"><path d="M3 3l4 4M7 3l-4 4" /></svg></button>
        <button class="wf-btn min" aria-label="Minimize" @click.stop="closeWindow(id)"><svg viewBox="0 0 10 10"><path d="M2.5 5h5" /></svg></button>
        <span class="wf-btn max"><svg viewBox="0 0 10 10"><path d="M3 7V3h4M7 3v4H3" /></svg></span>
      </div>
      <!-- Assistant windows use the companion's title bar (adapted from AIRI (MIT)): small icon and title, left-aligned. -->
      <div v-if="noCapture" class="wf-chip">
        <Icon :name="id === 'dashboard' ? 'dashboard' : 'settings'" :size="16" />
        <span>{{ w.title }}</span>
      </div>
      <div v-else-if="!unified" class="wf-text">{{ w.title }}</div>
    </header>
    <div
      class="wf-body"
      @pointerdown="onBodyPointerDown"
      @pointermove="onTitlePointerMove"
      @pointerup="onTitlePointerUp"
      @pointercancel="onTitlePointerUp"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.wf {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.22), inset 0 0 0 0.5px rgba(255, 255, 255, 0.5);
  transition: box-shadow 0.2s;
}
.wf.focused { box-shadow: 0 28px 70px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(0, 0, 0, 0.28), inset 0 0 0 0.5px rgba(255, 255, 255, 0.5); }
.wf-title {
  position: relative;
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  background: rgba(246, 246, 248, 0.92);
  backdrop-filter: saturate(180%) blur(24px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.09);
  cursor: default;
  user-select: none;
  touch-action: none;
}
.wf:not(.focused) .wf-title { background: #f2f2f4; }
/* Unified: no separate title bar, the app's own toolbar sits under the traffic lights. */
.wf.unified { background: rgba(255, 255, 255, 0.6); }
.wf.unified .wf-title {
  position: absolute;
  left: 0;
  top: 0;
  width: 120px;
  height: 56px;
  background: transparent;
  border-bottom: 0;
  backdrop-filter: none;
  z-index: 5;
}
.wf-lights { display: flex; gap: 9px; padding-left: 20px; z-index: 1; }
.wf-btn { display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; border: none; padding: 0; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.2); }
.wf-btn svg { width: 9px; height: 9px; stroke: rgba(0, 0, 0, 0.55); stroke-width: 1.4; fill: none; opacity: 0; }
.wf-lights:hover .wf-btn svg { opacity: 1; }
.wf-btn.close { background: #ff5f57; cursor: pointer; }
.wf-btn.min { cursor: pointer; }
.wf-btn.min { background: #febc2e; }
.wf-btn.max { background: #28c840; }
.wf:not(.focused) .wf-btn { background: #dcdcde; }
.wf-text {
  position: absolute;
  inset: 0 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 600;
  color: #3a3a3c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf:not(.focused) .wf-text { color: #a1a1a6; }
.wf.assistant .wf-title { height: 40px; flex-basis: 40px; background: #f5f5f5; border-bottom: 0; backdrop-filter: none; }
.wf.assistant:not(.focused) .wf-title { background: #f5f5f5; }
.wf-chip {
  display: flex; align-items: center; gap: 8px; margin-left: 18px; padding: 2px 6px; border-radius: 6px;
  font-size: 14px; color: #262626; white-space: nowrap; transition: background .2s ease-in-out;
}
.wf-chip:hover { background: #e5e5e5; }
.wf-chip svg { color: #a3a3a3; }
.wf-body { flex: 1; min-height: 0; position: relative; }
</style>
