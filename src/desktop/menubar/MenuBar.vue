<script setup lang="ts">
// macOS-style menu bar of the virtual desktop: system menu, app menus that follow the focused
// window, menu bar extras, and the desktop's own menu shortcuts.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDemo } from '@/stores/demo'
import TrayMenu from '../TrayMenu.vue'
import { displayName } from '../format'
import { menuBarClock, useDesktopStrings } from '../i18n'
import {
  APP_ORDER, ASSISTANT_APPS, bringAllToFront, closeWindow, desktop, focusWindow, isAssistantApp,
  minimizeWindow, zoomWindow, type AppId,
} from '../windows'
import { appCommands, lockScreen, runPowerCycle, systemState, type MailFolder } from './bridge'
import { buildMenus, shortcutAction, type MenuApp, type MenuContext } from './menus'
import MenuDropdown from './MenuDropdown.vue'
import StatusPanel, { type PanelKind } from './StatusPanel.vue'

const props = defineProps<{ now: Date }>()

const { t, locale } = useDesktopStrings()
const demo = useDemo()
const root = ref<HTMLElement | null>(null)

const clock = computed(() => menuBarClock(props.now, locale.value))

const focusedId = computed<AppId | null>(() => {
  const f = desktop.focused
  return f && desktop.windows[f].open ? f : null
})
const app = computed<MenuApp>(() => {
  const f = focusedId.value
  return !f ? 'finder' : isAssistantApp(f) ? 'assistant' : f
})
const appName = computed(() => app.value === 'assistant' ? 'YuiYumi' : app.value === 'finder' ? t.value.finder : t.value.apps[app.value])

/** Edit-menu state, sampled when a menu opens (the focused field keeps focus while it is open). */
const editState = ref({ editable: false, hasSelection: false })

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && /^(text|search|email|url|tel|password|number|)$/.test(el.type)
  return el.isContentEditable
}

function sampleEdit() {
  const el = document.activeElement
  const editable = isEditable(el) && !!root.value?.closest('[data-capture-root]')?.contains(el)
  let hasSelection = false
  if (editable && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) hasSelection = (el.selectionEnd ?? 0) > (el.selectionStart ?? 0)
  else hasSelection = !!window.getSelection()?.toString()
  editState.value = { editable, hasSelection }
}

const ctx = computed<MenuContext>(() => {
  const order: AppId[] = [...APP_ORDER, ...ASSISTANT_APPS]
  return {
    app: app.value,
    appName: appName.value,
    windows: order.filter(id => desktop.windows[id].open).map(id => ({
      id, title: desktop.windows[id].title, focused: focusedId.value === id, assistant: isAssistantApp(id),
    })),
    hasFocusedWindow: !!focusedId.value,
    edit: editState.value,
    mail: appCommands.mail.state?.(),
    user: displayName(demo.mails[0]?.to ?? 'User'),
  }
})
const menus = computed(() => buildMenus(ctx.value, t.value))

// ---- Open / hover / close ------------------------------------------------------------

type Extra = 'wifi' | 'battery' | 'cc' | 'clock'
/** 'menu:<id>' or 'extra:<kind>' */
const openKey = ref<string | null>(null)
const anchors = new Map<string, HTMLElement>()
const dropLeft = ref(0)
const panelRight = ref(0)

const openMenu = computed(() => {
  const k = openKey.value
  return k?.startsWith('menu:') ? menus.value.find(m => `menu:${m.id}` === k) ?? null : null
})
const openExtra = computed(() => {
  const k = openKey.value
  return k?.startsWith('extra:') ? k.slice(6) as PanelKind : null
})

function setAnchor(key: string, el: unknown) {
  if (el instanceof HTMLElement) anchors.set(key, el)
  else anchors.delete(key)
}

function show(key: string) {
  if (key.startsWith('menu:')) sampleEdit()
  openKey.value = key
  const el = anchors.get(key)
  const bar = root.value
  if (!el || !bar) return
  if (key.startsWith('menu:')) dropLeft.value = Math.max(6, el.offsetLeft - 6)
  else panelRight.value = Math.max(8, bar.clientWidth - (el.offsetLeft + el.offsetWidth))
}

function toggle(key: string) {
  if (openKey.value === key) openKey.value = null
  else show(key)
}

function hover(key: string) {
  if (openKey.value && openKey.value !== key) show(key)
}

function close() {
  openKey.value = null
}

// ---- Actions -------------------------------------------------------------------------

async function runEdit(cmd: string) {
  if (cmd === 'paste') {
    try {
      const text = await navigator.clipboard.readText()
      document.execCommand('insertText', false, text)
    } catch { /* clipboard read not permitted */ }
    return
  }
  document.execCommand(cmd)
}

function run(action: string) {
  close()
  const f = focusedId.value
  const [ns, a, b] = action.split(':')
  switch (ns) {
    case 'sys':
      if (a === 'about') systemState.dialog = 'about'
      else if (a === 'settings') systemState.dialog = 'settings'
      else if (a === 'sleep' || a === 'restart') runPowerCycle(a)
      else if (a === 'lock') lockScreen()
      break
    case 'app':
      if (a === 'about') {
        systemState.dialogApp = { icon: app.value === 'assistant' ? 'finder' : app.value, name: appName.value }
        systemState.dialog = 'app'
      } else if ((a === 'hide' || a === 'quit') && f) closeWindow(f)
      else if (a === 'hideOthers') {
        for (const id of APP_ORDER) if (id !== f && desktop.windows[id].open) closeWindow(id)
        if (f) focusWindow(f)
      }
      break
    case 'win':
      if (a === 'front') bringAllToFront()
      else if (f && a === 'close') closeWindow(f)
      else if (f && a === 'minimize') minimizeWindow(f)
      else if (f && a === 'zoom') zoomWindow(f)
      break
    case 'focus':
      focusWindow(a as AppId)
      break
    case 'edit':
      void runEdit(a!)
      break
    case 'mail':
      focusWindow('mail')
      if (a === 'new') void nextTick(() => appCommands.mail.newMessage?.())
      else if (a === 'folder') appCommands.mail.showFolder?.(b as MailFolder)
      else if (a === 'sidebar') appCommands.mail.toggleSidebar?.()
      else if (a === 'reply') appCommands.mail.reply?.()
      break
    case 'cal':
      focusWindow('calendar')
      break
    case 'go':
      if (a === 'drive') focusWindow('drive')
      else if (a === 'desktop') desktop.focused = null
      break
  }
}

// ---- Global listeners ----------------------------------------------------------------

/** Whether the last pointer press landed inside the virtual desktop. */
let pointerInDesktop = false

function onDocPointerDown(e: PointerEvent) {
  const target = e.target as Node
  const desk = root.value?.closest('[data-capture-root]')
  pointerInDesktop = !!desk?.contains(target)
  // Anything outside the titles, extras and their dropdowns (including the assistant tray) closes the menu.
  const own = target instanceof Element ? target.closest('.mb-title, .mb-extra, .md, .sp') : null
  if (openKey.value && !(own && root.value?.contains(own))) close()
}

function onDocKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openKey.value) {
    close()
    e.preventDefault()
    return
  }
  if (e.key === 'Escape' && systemState.dialog !== 'none') {
    systemState.dialog = 'none'
    return
  }
  const desk = root.value?.closest('[data-capture-root]')
  const active = document.activeElement
  const inDesktop = !!desk && (desk.contains(active) || ((!active || active === document.body) && pointerInDesktop))
  if (!inDesktop || systemState.overlay !== 'none') return
  const action = shortcutAction(e, { app: app.value, editable: isEditable(active), hasFocusedWindow: !!focusedId.value })
  if (!action) return
  e.preventDefault()
  run(action)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeyDown)
})

const EXTRAS: Extra[] = ['battery', 'wifi', 'cc']
const extraLabel = computed<Record<Extra, string>>(() => ({
  battery: `${t.value.mb.battery} 82%`, wifi: t.value.mb.wifi, cc: 'Control Center', clock: clock.value,
}))
</script>

<template>
  <!-- Dropdowns are siblings of the bar, not children: under the bar's backdrop-filter their fill does not paint. -->
  <div ref="root" class="mb-root">
    <div class="vd-menubar">
      <div class="vd-menu-left">
        <button
          v-for="m in menus"
          :key="m.id"
          :ref="el => setAnchor(`menu:${m.id}`, el)"
          type="button"
          class="mb-title"
          :class="{ open: openKey === `menu:${m.id}`, bold: m.bold, logo: m.id === 'system' }"
          :data-no-capture="m.noCapture ? '' : undefined"
          :aria-label="m.id === 'system' ? 'System menu' : undefined"
          @mousedown.prevent
          @click="toggle(`menu:${m.id}`)"
          @pointerenter="hover(`menu:${m.id}`)"
        >
          <svg v-if="m.id === 'system'" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2" /><circle cx="10" cy="10" r="2.4" class="fill" /></svg>
          <template v-else>{{ m.title }}</template>
        </button>
      </div>
      <div class="vd-menu-right">
        <TrayMenu />
        <button
          v-for="x in EXTRAS"
          :key="x"
          :ref="el => setAnchor(`extra:${x}`, el)"
          type="button"
          class="mb-extra"
          :class="{ open: openKey === `extra:${x}` }"
          :aria-label="extraLabel[x]"
          @mousedown.prevent
          @click="toggle(`extra:${x}`)"
          @pointerenter="hover(`extra:${x}`)"
        >
          <svg v-if="x === 'battery'" class="vd-battery" viewBox="0 0 34 18"><rect x="1" y="2" width="28" height="14" rx="4.5" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.4" /><rect x="3.4" y="4.4" width="19" height="9.2" rx="2.4" fill="currentColor" /><path d="M31 7.2v3.6" stroke="currentColor" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round" /></svg>
          <svg v-else-if="x === 'wifi'" class="vd-status" viewBox="0 0 26 20"><path d="M13 18.2 3.2 7.6a14 14 0 0 1 19.6 0z" fill="currentColor" :fill-opacity="systemState.wifi ? 1 : 0.28" /><path v-if="!systemState.wifi" d="M5 3l16 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <svg v-else class="vd-status" viewBox="0 0 24 20"><rect x="2.5" y="3" width="19" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="18.5" cy="6" r="2" fill="currentColor" /><rect x="2.5" y="11" width="19" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="5.5" cy="14" r="2" fill="currentColor" /></svg>
        </button>
        <button
          :ref="el => setAnchor('extra:clock', el)"
          type="button"
          class="mb-extra vd-clock"
          :class="{ open: openKey === 'extra:clock' }"
          @mousedown.prevent
          @click="toggle('extra:clock')"
          @pointerenter="hover('extra:clock')"
        >{{ clock }}</button>
      </div>
    </div>

    <MenuDropdown v-if="openMenu" :menu="openMenu" :left="dropLeft" @run="run" />
    <StatusPanel v-if="openExtra" :kind="openExtra" :right="panelRight" @close="close" />
  </div>
</template>

<style scoped>
.mb-root {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 40px;
  z-index: 100000;
}
.vd-menubar {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 14px;
  background: rgba(246, 246, 250, 0.42);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  font-size: 17px;
  letter-spacing: -0.01em;
  color: #1d1d1f;
  z-index: 100000;
}
.vd-menu-left, .vd-menu-right { display: flex; align-items: center; gap: 4px; }
.vd-menu-right { gap: 6px; }
.mb-title, .mb-extra {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font: inherit;
  font-weight: 500;
  color: inherit;
  white-space: nowrap;
  cursor: default;
}
.mb-title.bold { font-weight: 700; }
.mb-title.open, .mb-extra.open { background: rgba(0, 0, 0, 0.12); }
.mb-title.logo { padding: 0 10px; }
.mb-title.logo svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.mb-title.logo svg .fill { fill: currentColor; stroke: none; }
.mb-extra { padding: 0 8px; }
.vd-status { width: 24px; height: 20px; color: #1d1d1f; }
.vd-battery { width: 32px; height: 18px; color: #1d1d1f; }
.vd-clock { font-variant-numeric: tabular-nums; white-space: pre; }
</style>
