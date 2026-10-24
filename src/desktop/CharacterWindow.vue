<script setup lang="ts">
// Frameless, always-on-top, transparent character window inside the virtual desktop.
// The hover controls follow the desktop companion's controls island, adapted from AIRI
// stage-tamagotchi (MIT): a column of round translucent overlay buttons docked bottom-right
// (expand, talk, sound, move) and an expandable glass menu with a 3-column grid of actions.
// The island fades out when the cursor leaves the window unless the menu is open.
// Marked [data-no-capture]: never sent to the observer.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Lang } from '@shared/languages'
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
// Always beside the pill: the speech bubble owns the space over her head.
const dockV = computed(() => 'bottom' as const)

const store = useCharacterStore()
const settings = useSettings()
const label = computed(() => CHARACTER_MODELS[store.character].label)

interface IslandTips {
  settings: string, switchTo: (now: string) => string, dashboard: string, center: string
  pin: string, unpin: string, hide: string, more: string, less: string
  talk: (key: string) => string, mute: string, unmute: string, move: string
}
const TIPS: Record<Lang, IslandTips> = {
  'en': { settings: 'Open settings', switchTo: n => `Switch character (now ${n})`, dashboard: 'Open dashboard', center: 'Center window', pin: 'Pin on top', unpin: 'Unpin from top', hide: 'Hide character', more: 'More', less: 'Close menu', talk: k => `Hold to talk (or hold ${k})`, mute: 'Mute speech', unmute: 'Unmute speech', move: 'Drag to move' },
  'ja': { settings: '設定を開く', switchTo: n => `キャラクターを切り替え（今: ${n}）`, dashboard: 'ダッシュボードを開く', center: '中央に戻す', pin: '最前面に固定', unpin: '固定を解除', hide: 'キャラクターを隠す', more: 'その他', less: 'メニューを閉じる', talk: k => `押して話す（${k} 長押しでも可）`, mute: '音声をミュート', unmute: 'ミュート解除', move: 'ドラッグで移動' },
  'ko': { settings: '설정 열기', switchTo: n => `캐릭터 바꾸기 (지금: ${n})`, dashboard: '대시보드 열기', center: '가운데로', pin: '맨 위에 고정', unpin: '고정 해제', hide: '캐릭터 숨기기', more: '더 보기', less: '메뉴 닫기', talk: k => `누르고 말하기 (${k} 길게 눌러도 돼요)`, mute: '음성 끄기', unmute: '음성 켜기', move: '끌어서 옮기기' },
  'zh-Hans': { settings: '打开设置', switchTo: n => `切换角色（当前：${n}）`, dashboard: '打开仪表盘', center: '移到中间', pin: '置顶', unpin: '取消置顶', hide: '隐藏角色', more: '更多', less: '关闭菜单', talk: k => `按住说话（也可按住 ${k}）`, mute: '静音', unmute: '取消静音', move: '拖动移动' },
  'zh-Hant': { settings: '開啟設定', switchTo: n => `切換角色（目前：${n}）`, dashboard: '開啟儀表板', center: '移到中間', pin: '置頂', unpin: '取消置頂', hide: '隱藏角色', more: '更多', less: '關閉選單', talk: k => `按住說話（也可按住 ${k}）`, mute: '靜音', unmute: '取消靜音', move: '拖曳移動' },
}
const tip = computed(() => TIPS[settings.lang] ?? TIPS.en)
const pttLabel = computed(() => formatShortcut(settings.pttKey, isMacPlatform()))
const expanded = ref(false)
/** Position changes animate (agent choreography, move_self) except while dragging. */
const dragging = ref(false)

let drag: { px: number, py: number, x: number, y: number } | null = null

// Click-through: the window rectangle never takes the mouse. Only the avatar's own pixels
// (head pat, poke, body drag), the pill, the island and the bubbles do, so the apps
// behind her stay clickable.
const root = ref<HTMLElement | null>(null)
/** Pointer is over a visible pixel of the avatar. */
const overAvatar = ref(false)
/** Pointer is over the avatar or one of her controls: shows the island and badge. */
const hot = ref(false)
/** Body press that turns into a window drag after a few pixels. */
let bodyPress: { id: number, px: number, py: number, x: number, y: number } | null = null

function onGlobalMove(e: PointerEvent) {
  if (bodyPress && e.pointerId === bodyPress.id && !drag) {
    if (Math.hypot(e.clientX - bodyPress.px, e.clientY - bodyPress.py) > 5) {
      drag = { px: bodyPress.px, py: bodyPress.py, x: bodyPress.x, y: bodyPress.y }
      dragging.value = true
    }
  }
  if (drag && bodyPress && e.pointerId === bodyPress.id) {
    const s = desktopView.scale || 1
    moveAssistantWindow(drag.x + (e.clientX - drag.px) / s, drag.y + (e.clientY - drag.py) / s)
    return
  }
  if (drag) return
  overAvatar.value = characterHitTest(e.clientX, e.clientY) !== null
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const overUi = !!el && !!root.value?.contains(el) && !!el.closest('.cw-island, .pill, .bubble-anchor, .connect-slot')
  hot.value = overAvatar.value || overUi
}

function onGlobalUp(e: PointerEvent) {
  if (bodyPress && e.pointerId === bodyPress.id) {
    bodyPress = null
    if (drag) { drag = null; dragging.value = false }
  }
}

/** Capture phase, before the avatar's touch handler: a body press may become a drag. */
function onPointerDownCapture(e: PointerEvent) {
  if (e.button !== 0 || !(e.target as HTMLElement).closest('canvas')) return
  if (characterHitTest(e.clientX, e.clientY) !== 'body') return
  bodyPress = { id: e.pointerId, px: e.clientX, py: e.clientY, x: assistantWindow.x, y: assistantWindow.y }
}

onMounted(() => {
  // Window capture phase: the avatar stops propagation of its own touch moves.
  window.addEventListener('pointermove', onGlobalMove, { capture: true, passive: true })
  window.addEventListener('pointerup', onGlobalUp, true)
  window.addEventListener('pointercancel', onGlobalUp, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onGlobalMove, true)
  window.removeEventListener('pointerup', onGlobalUp, true)
  window.removeEventListener('pointercancel', onGlobalUp, true)
})

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
    ref="root"
    class="cw"
    :class="{ pinned: assistantWindow.pinned, expanded, dragging, hot, 'over-avatar': overAvatar }"
    :data-dock-h="dockH"
    :data-dock-v="dockV"
    data-no-capture
    :style="{ left: `${assistantWindow.x}px`, top: `${assistantWindow.y}px`, width: `${CHARACTER_W}px`, height: `${CHARACTER_H}px`, '--pill-zone': `${PILL_ZONE}px` }"
    @pointerdown.capture="onPointerDownCapture"
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
            <button type="button" class="ob" :data-tip="tip.settings" :aria-label="tip.settings" @click="open('settings')">
              <Icon name="settings" />
            </button>
            <button type="button" class="ob" :data-tip="tip.switchTo(label)" :aria-label="tip.switchTo(label)" @click="nextCharacter">
              <Icon name="swap" />
            </button>
            <button type="button" class="ob" :data-tip="tip.dashboard" :aria-label="tip.dashboard" @click="open('dashboard')">
              <Icon name="dashboard" />
            </button>
            <button type="button" class="ob" :data-tip="tip.center" :aria-label="tip.center" @click="centerWindow">
              <Icon name="target" />
            </button>
            <button
              type="button" class="ob" :class="{ dim: !assistantWindow.pinned }"
              :data-tip="assistantWindow.pinned ? tip.unpin : tip.pin"
              :aria-pressed="assistantWindow.pinned"
              @click="assistantWindow.pinned = !assistantWindow.pinned"
            >
              <Icon name="pin" />
            </button>
            <button type="button" class="ob danger" :data-tip="tip.hide" :aria-label="tip.hide" @click="hide">
              <Icon name="close-circle" />
            </button>
          </div>
        </div>
      </Transition>

      <div class="cw-main">
        <button
          type="button" class="ob" :aria-expanded="expanded"
          :data-tip="expanded ? tip.less : tip.more" :aria-label="expanded ? tip.less : tip.more"
          @click="expanded = !expanded"
        >
          <Icon name="more" />
        </button>
        <button
          type="button"
          class="ob talk"
          :class="{ on: voiceState.recording }"
          :data-tip="tip.talk(pttLabel)"
          :aria-label="tip.talk(pttLabel)"
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
          :data-tip="settings.sound ? tip.mute : tip.unmute"
          :aria-pressed="!settings.sound"
          @click="toggleSound"
        >
          <Icon :name="settings.sound ? 'volume' : 'volume-off'" />
        </button>
        <button type="button" class="ob cw-move" :data-tip="tip.move" :aria-label="tip.move">
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
.cw.hot .cw-island, .cw.expanded .cw-island { opacity: 1; transform: none; pointer-events: auto; }
.cw.hot .cw-badge { opacity: 1; transform: none; }
/* Click-through outside her pixels and controls. */
.cw { pointer-events: none; }
.cw :deep(.stage canvas) { pointer-events: none; }
.cw.over-avatar :deep(.stage canvas), .cw.dragging :deep(.stage canvas) { pointer-events: auto; }

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
