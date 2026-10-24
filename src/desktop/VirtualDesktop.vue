<script setup lang="ts">
// Virtual desktop: a fixed 1920x1080 logical canvas ([data-capture-root]) scaled to fit the
// viewport. The scale transform lives on the wrapper, so captures of the root are always
// rendered at 1920x1080 regardless of the page size.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { markKeystroke } from './activity'
import { APP_ORDER, assistantWindow, desktop, desktopView, DESKTOP_H, DESKTOP_W, focusWindow, type UserAppId } from './windows'
import AppIcon from './AppIcon.vue'
import CharacterWindow from './CharacterWindow.vue'
import { useDesktopStrings } from './i18n'
import MenuBar from './menubar/MenuBar.vue'
import SystemOverlays from './menubar/SystemOverlays.vue'
import NotificationCenter from './NotificationCenter.vue'
import WindowFrame from './WindowFrame.vue'
import DashboardApp from '@/settings/DashboardApp.vue'
import SettingsApp from '@/settings/SettingsApp.vue'
import CalendarApp from './apps/CalendarApp.vue'
import DiscordApp from './apps/DiscordApp.vue'
import DriveApp from './apps/DriveApp.vue'
import MailApp from './apps/MailApp.vue'
import SlackApp from './apps/SlackApp.vue'

const viewport = ref<HTMLElement | null>(null)
const box = ref({ w: DESKTOP_W, h: DESKTOP_H })
let ro: ResizeObserver | null = null

const fit = computed(() => {
  const s = Math.min(box.value.w / DESKTOP_W, box.value.h / DESKTOP_H)
  return { s, x: (box.value.w - DESKTOP_W * s) / 2, y: (box.value.h - DESKTOP_H * s) / 2 }
})

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  const el = viewport.value!
  const measure = () => {
    box.value = { w: el.clientWidth || DESKTOP_W, h: el.clientHeight || DESKTOP_H }
    desktopView.scale = fit.value.s
  }
  ro = new ResizeObserver(measure)
  ro.observe(el)
  measure()
  clockTimer = setInterval(() => { now.value = new Date() }, 10_000)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  if (clockTimer) clearInterval(clockTimer)
})

const { t } = useDesktopStrings()

function onAssistantDock() {
  assistantWindow.visible = true
  focusWindow('dashboard')
}

const ACCENT: Record<UserAppId, string> = {
  mail: '#1d6ff2', calendar: '#ff3b30', slack: '#4a154b', discord: '#5865f2', drive: '#0f9d58',
}

function onKeydown(e: KeyboardEvent) {
  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Delete') markKeystroke()
}
</script>

<template>
  <div ref="viewport" class="vd-viewport">
    <div
      class="vd-scaler"
      :style="{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` }"
    >
      <div class="vd-root" data-capture-root @keydown.capture="onKeydown">
        <div class="vd-wallpaper">
          <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="vdw-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fb8ff" /><stop offset="1" stop-color="#6d7cf0" /></linearGradient>
              <linearGradient id="vdw-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c6a8ff" /><stop offset="1" stop-color="#7fb2ff" /></linearGradient>
              <linearGradient id="vdw-c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb8c6" /><stop offset="0.55" stop-color="#d9a6ff" /><stop offset="1" stop-color="#8fc4ff" /></linearGradient>
              <linearGradient id="vdw-d" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd7b0" /><stop offset="1" stop-color="#f6a6c8" /></linearGradient>
            </defs>
            <rect width="1920" height="1080" fill="url(#vdw-a)" />
            <path d="M0 520 C 380 380, 760 640, 1180 500 S 1760 360, 1920 430 L1920 1080 L0 1080 Z" fill="url(#vdw-b)" opacity="0.9" />
            <path d="M0 700 C 420 560, 820 820, 1260 680 S 1780 600, 1920 660 L1920 1080 L0 1080 Z" fill="url(#vdw-c)" opacity="0.92" />
            <path d="M0 880 C 360 800, 900 980, 1340 870 S 1800 820, 1920 860 L1920 1080 L0 1080 Z" fill="url(#vdw-d)" opacity="0.95" />
          </svg>
        </div>

        <!-- Menu bar (menus and extras are captured; assistant parts carry data-no-capture) -->
        <MenuBar :now="now" />

        <!-- Windows -->
        <WindowFrame id="mail" :accent="ACCENT.mail" unified><MailApp /></WindowFrame>
        <WindowFrame id="calendar" :accent="ACCENT.calendar" unified><CalendarApp /></WindowFrame>
        <WindowFrame id="slack" :accent="ACCENT.slack"><SlackApp /></WindowFrame>
        <WindowFrame id="discord" :accent="ACCENT.discord"><DiscordApp /></WindowFrame>
        <WindowFrame id="drive" :accent="ACCENT.drive"><DriveApp /></WindowFrame>
        <!-- Assistant windows: excluded from captures. -->
        <WindowFrame id="settings" no-capture><SettingsApp /></WindowFrame>
        <WindowFrame id="dashboard" no-capture><DashboardApp /></WindowFrame>

        <!-- Always-on-top character window (excluded from captures). -->
        <CharacterWindow />

        <!-- Notification banners (captured: they are part of the user's screen). -->
        <NotificationCenter />

        <!-- Dock -->
        <nav class="vd-dock">
          <button class="vd-dock-item" :data-label="t.finder" @click="desktop.focused = null">
            <AppIcon app="finder" class="vd-icon" />
            <span class="vd-dot on" />
          </button>
          <button
            v-for="id in APP_ORDER"
            :key="id"
            class="vd-dock-item"
            :class="{ active: desktop.focused === id }"
            :data-label="t.apps[id]"
            @click="focusWindow(id)"
          >
            <AppIcon :app="id" class="vd-icon" />
            <span class="vd-dot" :class="{ on: desktop.windows[id].open }" />
          </button>
          <span class="vd-dock-sep" />
          <button class="vd-dock-item" data-label="YuiYumi" @click="onAssistantDock">
            <span class="vd-icon vd-icon-yy"><img src="/models/tt2-icon.png" alt="YuiYumi" draggable="false"></span>
            <span class="vd-dot" :class="{ on: assistantWindow.visible || desktop.windows.settings.open || desktop.windows.dashboard.open }" />
          </button>
          <span class="vd-dock-sep" />
          <button class="vd-dock-item" :data-label="t.trash">
            <AppIcon app="trash" class="vd-icon" />
            <span class="vd-dot" />
          </button>
        </nav>

        <!-- Brightness, sleep/restart/lock and system dialogs (captured: part of the user's screen). -->
        <SystemOverlays :now="now" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.vd-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #0b1020;
}
.vd-scaler {
  position: absolute;
  left: 0;
  top: 0;
  width: 1920px;
  height: 1080px;
  transform-origin: 0 0;
}
.vd-root {
  position: relative;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Apple SD Gothic Neo', 'PingFang SC', 'PingFang TC', 'Noto Sans CJK JP', 'Noto Sans KR', 'Segoe UI', 'Microsoft JhengHei', sans-serif;
  font-size: 20px;
  color: #1d1d1f;
  -webkit-font-smoothing: antialiased;
}
.vd-wallpaper { position: absolute; inset: 0; }
.vd-wallpaper svg { width: 100%; height: 100%; display: block; filter: blur(0.5px); }
.vd-dock {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px 6px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.32);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  box-shadow: 0 10px 40px rgba(20, 20, 60, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.45), 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  z-index: 100000;
}
.vd-dock-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: none;
  background: none;
  padding: 0 2px;
  cursor: pointer;
  font-family: inherit;
}
.vd-icon {
  width: 68px;
  height: 68px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 50% 100%;
  transition: transform 0.18s cubic-bezier(0.3, 0.7, 0.4, 1.2), margin 0.18s;
}
/* Dock magnification: hovered icon and its neighbours grow. */
.vd-dock-item:hover .vd-icon { transform: scale(1.38); margin: 0 14px; }
.vd-dock-item:hover + .vd-dock-item .vd-icon,
.vd-dock-item:has(+ .vd-dock-item:hover) .vd-icon { transform: scale(1.16); margin: 0 6px; }
.vd-dock-item::before {
  content: attr(data-label);
  position: absolute;
  bottom: 118px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: 8px;
  background: rgba(240, 240, 244, 0.85);
  backdrop-filter: blur(20px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.15);
  font-size: 15px;
  color: #1d1d1f;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}
.vd-dock-item:hover::before { opacity: 1; }
.vd-dock-sep { align-self: stretch; width: 1px; margin: 6px 6px 12px; background: rgba(0, 0, 0, 0.18); }
.vd-icon-yy { overflow: hidden; background: linear-gradient(160deg, #ffe4ef, #e0e7ff); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); }
.vd-icon-yy img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.vd-dot { width: 5px; height: 5px; border-radius: 50%; background: transparent; }
.vd-dot.on { background: rgba(0, 0, 0, 0.62); }
</style>
