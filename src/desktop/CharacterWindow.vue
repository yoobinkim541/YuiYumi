<script setup lang="ts">
// Frameless, always-on-top, transparent character window inside the virtual desktop.
// The hover controls follow the desktop companion's controls island, adapted from AIRI
// stage-tamagotchi (MIT): a column of round translucent overlay buttons docked bottom-right
// (expand, talk, sound, move) and an expandable glass menu with a 3-column grid of actions.
// The island fades out when the cursor leaves the window unless the menu is open.
// Marked [data-no-capture]: never sent to the observer.
import { computed, ref } from 'vue'
import { characterHitTest } from '@/character'
import CharacterLayer from '@/character/CharacterLayer.vue'
import { CHARACTER_MODELS } from '@/character/models'
import { characterView } from '@/character/state'
import { useCharacterStore } from '@/character/store'
import Icon from '@/settings/Icon.vue'
import { formatShortcut, isMacPlatform } from '@/settings/shortcut'
import { useSettings } from '@/stores/settings'
import { pttDown, pttUp, unlockAudio, voiceState } from '@/voice'
import {
  assistantWindow, CHARACTER_H, CHARACTER_W, DESKTOP_H, DESKTOP_W, desktopView, DOCK_H, focusWindow, MENUBAR_H, moveAssistantWindow, PILL_ZONE,
} from './windows'

// The controls island docks toward the inside of the screen: a window on the right half
// puts it on the left, a window on the lower half puts it at the top. It always stays
// above the pill zone.
const dockH = computed(() => (assistantWindow.x + CHARACTER_W / 2 > DESKTOP_W / 2 ? 'left' : 'right'))
const dockV = computed(() => (assistantWindow.y + CHARACTER_H / 2 > DESKTOP_H / 2 ? 'top' : 'bottom'))

const store = useCharacterStore()
const settings = useSettings()
const label = computed(() => CHARACTER_MODELS[store.character].label)
const pttLabel = computed(() => formatShortcut(settings.pttKey, isMacPlatform()))
const expanded = ref(false)
/** Position changes animate (agent choreography, move_self) except while dragging. */
const dragging = ref(false)

let drag: { px: number, py: number, x: number, y: number } | null = null

function onPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement
  const onMove = !!target.closest('.cw-move')
  if (!onMove && target.closest('button, select, .cw-menu')) return
  // Touching the avatar itself (head pat, grab) is handled by the character layer; the
  // window drags from transparent areas or the move button.
  if (!onMove && characterHitTest(e.clientX, e.clientY) !== null) return
  drag = { px: e.clientX, py: e.clientY, x: assistantWindow.x, y: assistantWindow.y }
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const s = desktopView.scale || 1
  moveAssistantWindow(drag.x + (e.clientX - drag.px) / s, drag.y + (e.clientY - drag.py) / s)
}

function onPointerUp() {
  drag = null
  dragging.value = false
}

function onLeave() {
  if (!drag) expanded.value = false
}

function onTalkDown(e: PointerEvent) {
  unlockAudio()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  void pttDown()
}

function nextCharacter() {
  const opts = store.options
  const i = opts.findIndex(o => o.id === store.character)
  const next = opts[(i + 1) % opts.length]
  if (next) store.setCharacter(next.id)
}

function centerWindow() {
  const usableH = DESKTOP_H - MENUBAR_H - DOCK_H
  moveAssistantWindow((DESKTOP_W - CHARACTER_W) / 2, MENUBAR_H + (usableH - CHARACTER_H) / 2)
}

function toggleSound() {
  unlockAudio()
  settings.sound = !settings.sound
}

function open(id: 'settings' | 'dashboard') {
  focusWindow(id)
  expanded.value = false
}

function hide() {
  expanded.value = false
  assistantWindow.visible = false
}
</script>

<template>
  <div
    v-show="assistantWindow.visible"
    class="cw"
    :class="{ pinned: assistantWindow.pinned, expanded, dragging }"
    :data-dock-h="dockH"
    :data-dock-v="dockV"
    data-no-capture
    :style="{ left: `${assistantWindow.x}px`, top: `${assistantWindow.y}px`, width: `${CHARACTER_W}px`, height: `${CHARACTER_H}px`, '--pill-zone': `${PILL_ZONE}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onLeave"
  >
    <CharacterLayer class="cw-layer" />

    <!-- Status badge (name and live node) -->
    <div class="cw-badge">
      <span class="cw-dot" :class="characterView.node" />
      <span>{{ label }}</span>
    </div>

    <!-- Controls island -->
    <div class="cw-island">
      <Transition name="cw-menu">
        <div v-if="expanded" class="cw-menu" role="menu">
          <div class="cw-grid">
            <button type="button" class="ob" data-tip="Open settings" aria-label="Open settings" @click="open('settings')">
              <Icon name="settings" />
            </button>
            <button type="button" class="ob" :data-tip="`Switch character (now ${label})`" aria-label="Switch character" @click="nextCharacter">
              <Icon name="smile" />
            </button>
            <button type="button" class="ob" data-tip="Open dashboard" aria-label="Open dashboard" @click="open('dashboard')">
              <Icon name="dashboard" />
            </button>
            <button type="button" class="ob" data-tip="Center window" aria-label="Center window" @click="centerWindow">
              <Icon name="target" />
            </button>
            <button
              type="button" class="ob" :class="{ dim: !assistantWindow.pinned }"
              :data-tip="assistantWindow.pinned ? 'Unpin from top' : 'Pin on top'"
              :aria-pressed="assistantWindow.pinned"
              @click="assistantWindow.pinned = !assistantWindow.pinned"
            >
              <Icon name="pin" />
            </button>
            <button type="button" class="ob danger" data-tip="Hide character" aria-label="Hide character" @click="hide">
              <Icon name="close-circle" />
            </button>
          </div>
        </div>
      </Transition>

      <div class="cw-main">
        <button
          type="button" class="ob" :aria-expanded="expanded"
          :data-tip="expanded ? 'Collapse' : 'Expand'"
          @click="expanded = !expanded"
        >
          <Icon name="chevron-up" class="cw-arrow" :style="{ transform: `rotate(${expanded ? 180 : 0}deg)` }" />
        </button>
        <button
          type="button"
          class="ob talk"
          :class="{ on: voiceState.recording }"
          :data-tip="`Hold to talk (or hold ${pttLabel})`"
          aria-label="Hold to talk"
          @pointerdown.prevent="onTalkDown"
          @pointerup="pttUp()"
          @pointercancel="pttUp()"
          @contextmenu.prevent
        >
          <span v-if="voiceState.recording" class="cw-level"><i /><i /><i /></span>
          <Icon v-else name="mic" />
        </button>
        <button
          type="button" class="ob"
          :data-tip="settings.sound ? 'Mute speech' : 'Unmute speech'"
          :aria-pressed="!settings.sound"
          @click="toggleSound"
        >
          <Icon :name="settings.sound ? 'volume' : 'volume-off'" />
        </button>
        <button type="button" class="ob cw-move" data-tip="Drag to move window" aria-label="Drag to move window">
          <Icon name="move" />
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
  transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.cw.dragging { transition: none; }
.cw.pinned { z-index: 90000; }
.cw:active { cursor: grabbing; }
.cw-layer { position: absolute; inset: 0; }

.cw-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgb(250 250 250 / 0.8);
  backdrop-filter: blur(12px);
  color: #262626;
  font: 500 13px/1.4 "DM Sans", system-ui, sans-serif;
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  pointer-events: none;
}
.cw-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.cw-dot.working, .cw-dot.waiting { background: #f59e0b; }
.cw-dot.speaking, .cw-dot.listening { background: #22a9d2; }
.cw-dot.failed { background: #ef4444; }
.cw-dot.sleeping { background: #a3a3a3; }

.cw-island {
  position: absolute;
  right: 8px;
  bottom: calc(var(--pill-zone) + 8px);
  display: flex;
  align-items: flex-end;
  gap: 12px;
  opacity: 0;
  transform: scale(0.95) translateX(12px);
  transform-origin: bottom right;
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  pointer-events: none;
}
.cw:hover .cw-island, .cw.expanded .cw-island { opacity: 1; transform: none; pointer-events: auto; }
.cw:hover .cw-badge { opacity: 1; transform: none; }

.cw-main { display: flex; flex-direction: column; gap: 4px; flex: none; }

/* Overlay button (AIRI OverlayButton) */
.ob {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 8px;
  border: 0;
  border-radius: 12px;
  background: rgb(250 250 250 / 0.8);
  backdrop-filter: blur(12px);
  color: #262626;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.ob:hover { color: #1789ad; }
.ob:active { background: rgb(179 229 244 / 0.8); color: #0e5c74; }
.ob.dim :deep(svg) { opacity: 0.5; }
.ob.danger:hover { background: #ef4444; color: #fff; }
.ob.talk.on { background: rgb(239 68 68 / 0.85); color: #fff; }
.ob.cw-move { cursor: move; }
.cw-arrow { transition: transform 0.3s; scale: 1.1; }

.cw-level { display: flex; align-items: center; gap: 2px; height: 20px; }
.cw-level i { width: 3px; height: 8px; border-radius: 2px; background: currentColor; animation: cw-bar 0.8s ease-in-out infinite; }
.cw-level i:nth-child(2) { animation-delay: 0.15s; }
.cw-level i:nth-child(3) { animation-delay: 0.3s; }
@keyframes cw-bar { 50% { height: 18px; } }

/* Glass menu (AIRI controls menu) */
.cw-menu {
  padding: 8px;
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: rgb(245 245 245 / 0.8);
  backdrop-filter: blur(24px);
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.2);
  transform-origin: bottom right;
}
.cw-grid { display: grid; grid-template-columns: repeat(3, 40px); gap: 8px; }
.cw-menu-enter-active { animation: cw-menu-in 400ms cubic-bezier(0.32, 0.72, 0, 1) both; }
.cw-menu-leave-active { animation: cw-menu-in 300ms ease-in reverse both; }
@keyframes cw-menu-in {
  from { opacity: 0; transform: translateX(12px) scale(0.9); }
  to { opacity: 1; transform: none; }
}

/* Docking variants: the island moves toward the screen's inside, the badge to the other side. */
.cw[data-dock-h='left'] .cw-island { right: auto; left: 8px; flex-direction: row-reverse; transform-origin: bottom left; }
.cw[data-dock-h='left'] .cw-badge { left: auto; right: 8px; }
.cw[data-dock-v='top'] .cw-island { bottom: auto; top: 8px; align-items: flex-start; }
.cw[data-dock-v='top'] .cw-badge { top: auto; bottom: calc(var(--pill-zone) + 8px); }
.cw[data-dock-h='left'] .cw-menu { transform-origin: bottom left; }
.cw[data-dock-v='top'] .cw-menu { transform-origin: top right; }
.cw[data-dock-h='left'][data-dock-v='top'] .cw-menu { transform-origin: top left; }

/* Name tooltip on hover (overlay buttons). */
.ob { position: relative; }
.ob[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translate(-50%, 4px);
  z-index: 5;
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
.ob[data-tip]:hover::after { opacity: 1; transform: translate(-50%, 0); }
</style>
