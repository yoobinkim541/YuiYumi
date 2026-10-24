<script setup lang="ts">
import { computed } from 'vue'
import { closeWindow, desktop, desktopView, focusWindow, moveWindow, type AppId } from './windows'

const props = defineProps<{ id: AppId, accent?: string, noCapture?: boolean }>()

const w = computed(() => desktop.windows[props.id])
const focused = computed(() => desktop.focused === props.id)

let drag: { px: number, py: number, x: number, y: number } | null = null

function onTitlePointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.wf-btn')) return
  focusWindow(props.id)
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
    :class="{ focused }"
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
      <div class="wf-text">{{ w.title }}</div>
    </header>
    <div class="wf-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.wf {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.1);
  transition: box-shadow 0.2s;
}
.wf.focused { box-shadow: 0 30px 80px rgba(15, 23, 42, 0.34), 0 0 0 1px rgba(15, 23, 42, 0.16); }
.wf-title {
  position: relative;
  height: 46px;
  flex: 0 0 46px;
  display: flex;
  align-items: center;
  background: rgba(244, 245, 248, 0.86);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  cursor: default;
  user-select: none;
  touch-action: none;
}
.wf:not(.focused) .wf-title { background: #f3f4f6; }
.wf-lights { display: flex; gap: 9px; padding-left: 16px; z-index: 1; }
.wf-btn { display: flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; border: none; padding: 0; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
.wf-btn svg { width: 9px; height: 9px; stroke: rgba(0, 0, 0, 0.55); stroke-width: 1.4; fill: none; opacity: 0; }
.wf-lights:hover .wf-btn svg { opacity: 1; }
.wf-btn.close { background: #ff5f57; cursor: pointer; }
.wf-btn.min { cursor: pointer; }
.wf-btn.min { background: #febc2e; }
.wf-btn.max { background: #28c840; }
.wf:not(.focused) .wf-btn { background: #d1d5db; }
.wf-text {
  position: absolute;
  inset: 0 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wf-body { flex: 1; min-height: 0; position: relative; }
</style>
