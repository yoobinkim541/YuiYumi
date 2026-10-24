// Overlay window: the character over the real desktop. Mounts the same character, voice,
// nunchi and agent modules as the web app, with the native screen source instead of the
// virtual desktop, and adds what a transparent overlay needs: click-through on transparent
// pixels, dragging by the avatar body, a global push-to-talk shortcut and the tray labels.

import { createPinia } from 'pinia'
import { createApp, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { bus } from '@/core/bus'
import { initAgent } from '@/agent'
import { characterHitTest, initCharacter, useCharacterStore } from '@/character'
import { refreshLive, startLiveConnectors } from '@/connectors/live'
import { buildDemoData, reseedDemoData } from '@/desktop/seed'
import { desktop } from '@/desktop/windows'
import { setScreenSource } from '@/host'
import { TauriScreenSource } from '@/host/tauri-screen-source'
import { initNunchi, nunchiStatus, recentDialogue } from '@/nunchi'
import { activity } from '@/settings/activity'
import { hasCommandModifier, type Shortcut } from '@/settings/shortcut'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { initVoice, pttDown, pttUp, setVadEnabled, unlockAudio, voiceState } from '@/voice'
import { installApiAuth } from './auth'
import OverlayApp from './OverlayApp.vue'
import { screenRect } from './screen'
import { DESKTOP_STRINGS } from './strings'
import { broadcastRuntime, onCommand, syncStores } from './sync'

const PROBE_MS = 50
const DRAG_SLOP_PX = 4
const PERMISSION_NOTICE_MS = 10 * 60 * 1000
const PERMISSION_ASKED_KEY = 'yuiyumi.desktop.screenAsked'

export async function mountOverlay(): Promise<void> {
  document.documentElement.classList.add('yy-overlay')
  await installApiAuth(() => void refreshLive())
  const app = createApp(OverlayApp)
  app.use(createPinia())

  const settings = useSettings()
  setScreenSource(new TauriScreenSource(() => onScreenPermissionMissing(settings.lang)))
  seedDemo()
  app.mount('#app')

  initCharacter()
  initNunchi()
  initVoice()
  initAgent()
  void startLiveConnectors()

  openPanelsOnRequest()
  installClickThrough()
  installBodyDrag()
  installGlobalPtt()
  watch(() => settings.lang, lang => void invoke('set_tray_labels', { labels: DESKTOP_STRINGS[lang].tray }), { immediate: true })

  const resend = syncStores([settings, useCharacterStore(), usePersona(), useDemo()])
  broadcastRuntime(() => ({
    voice: { ...voiceState },
    nunchi: { ...nunchiStatus },
    activity: { ...activity },
    dialogue: recentDialogue(),
  }), resend)
  onCommand((c) => { if (typeof c.vad === 'boolean') void setVadEnabled(c.vad) })
}

/** Mock connector data (used when a live connector is not signed in), in the UI language. */
function seedDemo() {
  const demo = useDemo()
  const settings = useSettings()
  const seedTime = new Date()
  demo.seed(buildDemoData(seedTime, settings.lang))
  watch(() => settings.lang, (lang) => {
    demo.seed(reseedDemoData(seedTime, lang, { mails: demo.mails, events: demo.events, slackMessages: demo.slackMessages, discordMessages: demo.discordMessages }))
  })
}

/** The pill's settings button and others focus the virtual desktop's windows: open panels instead. */
function openPanelsOnRequest() {
  watch(() => desktop.focused, (id) => {
    if (id !== 'settings' && id !== 'dashboard') return
    desktop.windows[id].open = false
    desktop.focused = null
    void invoke('open_panel', { view: id })
  }, { flush: 'sync' })
}

let lastNotice = 0
let requested = false

function onScreenPermissionMissing(lang: keyof typeof DESKTOP_STRINGS) {
  if (!requested) {
    requested = true
    // The system prompt appears once per install; after that, System Settings is the way.
    if (localStorage.getItem(PERMISSION_ASKED_KEY)) void invoke('open_screen_settings')
    else void invoke('screen_permission', { request: true })
    localStorage.setItem(PERMISSION_ASKED_KEY, '1')
  }
  if (Date.now() - lastNotice < PERMISSION_NOTICE_MS) return
  lastNotice = Date.now()
  bus.emit('character:react', { emotion: 'sorry', line: DESKTOP_STRINGS[lang].screenPermission, source: 'fallback' })
}

// ---------------------------------------------------------------------------
// Click-through: the window ignores the mouse except over the avatar, the bubble, the pill
// and the confirm card. While ignored the page gets no mouse events, so the global cursor
// position is polled from the shell.

/** A pointer is held inside the overlay (drag, hold-to-talk, head pat): keep the mouse. */
let held = false
let draggingWindow = false
const dragActive = () => draggingWindow

function interactiveAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false
  const el = document.elementFromPoint(x, y)
  if (!el || el === document.documentElement || el === document.body || el.id === 'app' || el.closest('[data-pass-through]')) return false
  if (el instanceof HTMLCanvasElement) return characterHitTest(x, y) !== null
  return true
}

function installClickThrough() {
  const win = getCurrentWindow()
  let ignoring: boolean | null = null
  let busy = false
  window.addEventListener('pointerdown', () => { held = true }, true)
  window.addEventListener('pointerup', () => { if (!dragActive()) held = false }, true)
  window.addEventListener('pointercancel', () => { if (!dragActive()) held = false }, true)
  window.addEventListener('blur', () => { if (!dragActive()) held = false })
  setInterval(async () => {
    if (busy || document.visibilityState !== 'visible') return
    busy = true
    try {
      const p = await invoke<{ x: number, y: number, originX: number, originY: number } | null>('cursor_local')
      if (!p) return
      screenRect.left = -p.originX
      screenRect.top = -p.originY
      screenRect.width = screen.width
      screenRect.height = screen.height
      const ignore = !(held || interactiveAt(p.x, p.y))
      if (ignore !== ignoring) {
        ignoring = ignore
        await win.setIgnoreCursorEvents(ignore)
      }
    } catch { /* window closing */ } finally {
      busy = false
    }
  }, PROBE_MS)
}

/**
 * Pressing her body and moving drags the window (a press on her head stays a head pat). The
 * shell moves the native window with the global cursor until release, so she can go
 * anywhere on any display; it keeps part of her on screen.
 */
function installBodyDrag() {
  let start: { x: number, y: number, id: number, el: Element } | null = null
  void listen('yy://drag-end', () => { draggingWindow = false; held = false })
  document.addEventListener('pointerdown', (e) => {
    start = null
    if (draggingWindow || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return
    if (characterHitTest(e.clientX, e.clientY) !== 'body') return
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, el: e.target }
  }, true)
  document.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_SLOP_PX) return
    // The avatar's touch ends here; the window follows the cursor from now on.
    if (start.el.hasPointerCapture(start.id)) start.el.releasePointerCapture(start.id)
    const start0 = start
    start = null
    draggingWindow = true
    held = true
    const r = document.querySelector('.ov-character')?.getBoundingClientRect()
    const character = r ? [r.left, r.top, r.width, r.height] : [0, 0, window.innerWidth, window.innerHeight]
    // Where the press happened, in screen points (the window origin comes from the cursor probe).
    const anchor = [start0.x - screenRect.left, start0.y - screenRect.top]
    void invoke('drag_start', { character, anchor })
  }, true)
  document.addEventListener('pointerup', () => { start = null }, true)
}

// ---------------------------------------------------------------------------
// Global push-to-talk mirrors settings.pttKey (hold: press = talk, release = send). Only
// shortcuts with Ctrl, Option or Cmd are registered system-wide; a bare key (the default
// Space) would block that key in every app, so it works only while the overlay has focus.

export function accelerator(s: Shortcut): string | null {
  if (!hasCommandModifier(s)) return null
  return [s.ctrl && 'Control', s.alt && 'Alt', s.shift && 'Shift', s.meta && 'Super', s.code].filter(Boolean).join('+')
}

function installGlobalPtt() {
  const settings = useSettings()
  let chain = Promise.resolve()
  watch(() => accelerator(settings.pttKey), (acc) => {
    chain = chain.then(async () => {
      await unregisterAll()
      if (!acc) return
      await register(acc, (e) => {
        if (e.state === 'Pressed') { unlockAudio(); void pttDown() }
        else pttUp()
      })
    }).catch(e => console.warn('[desktop] global shortcut', e))
  }, { immediate: true })
}
