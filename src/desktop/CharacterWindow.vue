<script setup lang="ts">
// Frameless, always-on-top character window inside the virtual desktop, styled after the
// AIRI desktop companion window (adapted from AIRI stage-tamagotchi, MIT): rounded,
// translucent, controls appear on hover. Marked [data-no-capture]: never sent to the observer.
import { computed } from 'vue'
import CharacterLayer from '@/character/CharacterLayer.vue'
import { CHARACTER_MODELS } from '@/character/models'
import { characterView } from '@/character/state'
import { useCharacterStore } from '@/character/store'
import { pttDown, pttUp, unlockAudio, voiceState } from '@/voice'
import { assistantWindow, CHARACTER_H, CHARACTER_W, desktopView, focusWindow, moveAssistantWindow } from './windows'

const store = useCharacterStore()
const label = computed(() => CHARACTER_MODELS[store.character].label)

let drag: { px: number, py: number, x: number, y: number } | null = null

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, select')) return
  drag = { px: e.clientX, py: e.clientY, x: assistantWindow.x, y: assistantWindow.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const s = desktopView.scale || 1
  moveAssistantWindow(drag.x + (e.clientX - drag.px) / s, drag.y + (e.clientY - drag.py) / s)
}

function onPointerUp() {
  drag = null
}

function onTalkDown(e: PointerEvent) {
  unlockAudio()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  void pttDown()
}
</script>

<template>
  <div
    v-show="assistantWindow.visible"
    class="cw"
    :class="{ pinned: assistantWindow.pinned }"
    data-no-capture
    :style="{ left: `${assistantWindow.x}px`, top: `${assistantWindow.y}px`, width: `${CHARACTER_W}px`, height: `${CHARACTER_H}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <CharacterLayer class="cw-layer" />

    <div class="cw-controls">
      <div class="cw-row">
        <span class="cw-dot" :class="characterView.node" />
        <span class="cw-name">{{ label }}</span>
        <div class="cw-switcher" role="group" aria-label="Character">
          <button
            v-for="o in store.options"
            :key="o.id"
            type="button"
            :class="{ active: store.character === o.id }"
            :aria-pressed="store.character === o.id"
            @click="store.setCharacter(o.id)"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <div class="cw-row cw-actions">
        <button type="button" class="cw-btn" :class="{ on: assistantWindow.pinned }" title="Always on top" @click="assistantWindow.pinned = !assistantWindow.pinned">
          <svg viewBox="0 0 24 24"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" /></svg>
        </button>
        <button type="button" class="cw-btn" title="Settings" @click="focusWindow('settings')">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
        </button>
        <button
          type="button"
          class="cw-btn talk"
          :class="{ on: voiceState.recording }"
          title="Hold to talk (or hold Space)"
          @pointerdown.prevent="onTalkDown"
          @pointerup="pttUp()"
          @pointercancel="pttUp()"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>
        <button type="button" class="cw-btn" title="Hide" @click="assistantWindow.visible = false">
          <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cw {
  position: absolute;
  z-index: 9;
  touch-action: none;
  cursor: grab;
}
.cw.pinned { z-index: 90000; }
.cw:active { cursor: grabbing; }
.cw-layer { position: absolute; inset: 0; }
.cw-controls {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}
.cw:hover .cw-controls { opacity: 1; transform: none; pointer-events: auto; }
.cw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  box-shadow: 0 4px 14px rgba(40, 24, 70, 0.14);
  color: #4a3f5c;
  font-size: 15px;
  font-weight: 600;
}
.cw-actions { align-self: flex-end; padding: 5px; gap: 4px; }
.cw-name { flex: 1; white-space: nowrap; }
.cw-dot { width: 10px; height: 10px; border-radius: 50%; background: #9be38f; }
.cw-dot.working, .cw-dot.waiting { background: #f5c451; }
.cw-dot.speaking, .cw-dot.listening { background: #7aa7ff; }
.cw-dot.failed { background: #ff8a8a; }
.cw-dot.sleeping { background: #c9c3d6; }
.cw-switcher { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: rgba(74, 63, 92, 0.1); }
.cw-switcher button {
  border: 0;
  border-radius: 999px;
  padding: 4px 10px;
  background: transparent;
  color: #4a3f5c;
  font-size: 13px;
  cursor: pointer;
}
.cw-switcher button.active { background: #fff; color: #2a2230; box-shadow: 0 1px 3px rgba(40, 24, 70, 0.15); }
.cw-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #4a3f5c;
  cursor: pointer;
}
.cw-btn:hover { background: rgba(74, 63, 92, 0.1); }
.cw-btn.on { background: rgba(122, 167, 255, 0.25); color: #2f5fd0; }
.cw-btn.talk.on { background: rgba(255, 80, 80, 0.25); color: #d02f2f; }
.cw-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
