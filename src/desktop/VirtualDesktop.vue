<script setup lang="ts">
// Virtual desktop: a fixed 1920x1080 logical canvas ([data-capture-root]) scaled to fit the
// viewport. The scale transform lives on the wrapper, so captures of the root are always
// rendered at 1920x1080 regardless of the page size.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { markKeystroke } from './activity'
import { APP_ORDER, assistantWindow, desktop, desktopView, DESKTOP_H, DESKTOP_W, focusWindow, isAssistantApp, type UserAppId } from './windows'
import CharacterWindow from './CharacterWindow.vue'
import NotificationCenter from './NotificationCenter.vue'
import TrayMenu from './TrayMenu.vue'
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

const clock = computed(() => now.value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
const dateLabel = computed(() => now.value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
const activeName = computed(() => {
  const f = desktop.focused
  return f && desktop.windows[f].open && !isAssistantApp(f) ? desktop.windows[f].appName : 'Finder'
})
// When an assistant window is focused the menu bar shows its name, but that label is
// excluded from captures so the observer never reads it.
const assistantFocused = computed(() => {
  const f = desktop.focused
  return !!f && desktop.windows[f].open && isAssistantApp(f)
})
const MENUS = ['File', 'Edit', 'View', 'Go', 'Window', 'Help']

function onAssistantDock() {
  assistantWindow.visible = true
  focusWindow('dashboard')
}

const APPS: Record<UserAppId, { label: string, bg: string, accent: string }> = {
  mail: { label: 'Mail', bg: 'linear-gradient(160deg,#5aa9ff,#1e6bff)', accent: '#1e6bff' },
  calendar: { label: 'Calendar', bg: 'linear-gradient(160deg,#ffffff,#eef0f4)', accent: '#ef4444' },
  slack: { label: 'Slack', bg: 'linear-gradient(160deg,#7c3a8f,#4a154b)', accent: '#4a154b' },
  discord: { label: 'Discord', bg: 'linear-gradient(160deg,#7d8bff,#5865f2)', accent: '#5865f2' },
  drive: { label: 'Drive', bg: 'linear-gradient(160deg,#34d399,#0f9d58)', accent: '#0f9d58' },
}

const today = computed(() => now.value.getDate())

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
        <div class="vd-wallpaper" />

        <!-- Menu bar -->
        <div class="vd-menubar">
          <div class="vd-menu-left">
            <span class="vd-logo" aria-label="System menu">
              <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" /><path d="M10 2a8 8 0 0 0 0 16M2 10h16" /></svg>
            </span>
            <strong v-if="assistantFocused" data-no-capture>YuiYumi</strong>
            <strong v-else>{{ activeName }}</strong>
            <span v-for="m in MENUS" :key="m">{{ m }}</span>
          </div>
          <div class="vd-menu-right">
            <TrayMenu />
            <svg class="vd-status" viewBox="0 0 26 20" aria-label="Wi-Fi"><path d="M2 7.5a16 16 0 0 1 22 0M5.5 11a11 11 0 0 1 15 0M9 14.5a6 6 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /><circle cx="13" cy="17.5" r="1.6" fill="currentColor" /></svg>
            <span class="vd-battery" aria-label="Battery 82%"><span class="vd-battery-pct">82%</span><svg viewBox="0 0 34 18"><rect x="1" y="2" width="28" height="14" rx="4" fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.6" /><rect x="3.5" y="4.5" width="19" height="9" rx="2" fill="currentColor" /><path d="M31 7v4" stroke="currentColor" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round" /></svg></span>
            <svg class="vd-status" viewBox="0 0 22 20" aria-label="Control Center"><rect x="2" y="3" width="18" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="6" cy="6" r="1.8" fill="currentColor" /><rect x="2" y="11" width="18" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="16" cy="14" r="1.8" fill="currentColor" /></svg>
            <span>{{ dateLabel }}</span>
            <strong>{{ clock }}</strong>
          </div>
        </div>

        <!-- Windows -->
        <WindowFrame id="mail" :accent="APPS.mail.accent"><MailApp /></WindowFrame>
        <WindowFrame id="calendar" :accent="APPS.calendar.accent"><CalendarApp /></WindowFrame>
        <WindowFrame id="slack" :accent="APPS.slack.accent"><SlackApp /></WindowFrame>
        <WindowFrame id="discord" :accent="APPS.discord.accent"><DiscordApp /></WindowFrame>
        <WindowFrame id="drive" :accent="APPS.drive.accent"><DriveApp /></WindowFrame>
        <!-- Assistant windows: excluded from captures. -->
        <WindowFrame id="settings" no-capture><SettingsApp /></WindowFrame>
        <WindowFrame id="dashboard" no-capture><DashboardApp /></WindowFrame>

        <!-- Always-on-top character window (excluded from captures). -->
        <CharacterWindow />

        <!-- Notification banners (captured: they are part of the user's screen). -->
        <NotificationCenter />

        <!-- Dock -->
        <nav class="vd-dock">
          <button
            v-for="id in APP_ORDER"
            :key="id"
            class="vd-dock-item"
            :class="{ active: desktop.focused === id }"
            :title="APPS[id].label"
            @click="focusWindow(id)"
          >
            <span class="vd-icon" :style="{ background: APPS[id].bg }">
              <svg v-if="id === 'mail'" viewBox="0 0 48 48"><rect x="7" y="12" width="34" height="24" rx="4" fill="#fff" /><path d="M8 14l16 12 16-12" stroke="#1e6bff" stroke-width="3" fill="none" /></svg>
              <span v-else-if="id === 'calendar'" class="vd-cal-icon"><em>{{ dateLabel.split(' ')[0] }}</em><b>{{ today }}</b></span>
              <svg v-else-if="id === 'slack'" viewBox="0 0 48 48"><g stroke-width="5" stroke-linecap="round"><path d="M18 10v28" stroke="#36c5f0" /><path d="M30 10v28" stroke="#2eb67d" /><path d="M10 18h28" stroke="#ecb22e" /><path d="M10 30h28" stroke="#e01e5a" /></g></svg>
              <svg v-else-if="id === 'discord'" viewBox="0 0 48 48"><path d="M12 15c4-3 8-4 12-4s8 1 12 4c3 5 4 11 4 18-3 3-7 4-10 4l-2-3c-3 1-6 1-8 0l-2 3c-3 0-7-1-10-4 0-7 1-13 4-18z" fill="#fff" /><circle cx="19" cy="26" r="3" fill="#5865f2" /><circle cx="29" cy="26" r="3" fill="#5865f2" /></svg>
              <svg v-else viewBox="0 0 48 48"><path d="M17 9h14l12 21-7 11H12L5 30z" fill="#fff" /><path d="M17 9l12 21H5z" fill="#fde68a" /><path d="M29 30h14l-7 11H12z" fill="#bfdbfe" /></svg>
            </span>
            <span class="vd-dot" :class="{ on: desktop.windows[id].open }" />
          </button>
          <span class="vd-dock-sep" />
          <button class="vd-dock-item" title="YuiYumi" @click="onAssistantDock">
            <span class="vd-icon vd-icon-yy"><img src="/models/tt2-icon.png" alt="YuiYumi" draggable="false"></span>
            <span class="vd-dot" :class="{ on: assistantWindow.visible || desktop.windows.settings.open || desktop.windows.dashboard.open }" />
          </button>
        </nav>
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'PingFang TC', 'Apple SD Gothic Neo', 'Noto Sans CJK JP', 'Noto Sans KR', 'Microsoft JhengHei', sans-serif;
  font-size: 20px;
  color: #111827;
  -webkit-font-smoothing: antialiased;
}
.vd-wallpaper {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(1200px 700px at 15% 20%, rgba(255, 183, 197, 0.85), transparent 60%),
    radial-gradient(1000px 800px at 85% 30%, rgba(147, 197, 253, 0.9), transparent 60%),
    radial-gradient(900px 700px at 50% 100%, rgba(196, 181, 253, 0.9), transparent 60%),
    linear-gradient(135deg, #fde2e4, #dbeafe);
}
.vd-menubar {
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
  font-size: 17px;
  color: #1f2937;
  z-index: 100000;
}
.vd-menu-left, .vd-menu-right { display: flex; align-items: center; gap: 22px; }
.vd-menu-right { gap: 18px; }
.vd-logo { display: flex; width: 22px; height: 22px; }
.vd-logo svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.vd-menu-left span { font-weight: 450; }
.vd-status { width: 26px; height: 20px; color: #1f2937; }
.vd-battery { display: flex; align-items: center; gap: 6px; font-size: 15px; }
.vd-battery svg { width: 34px; height: 18px; color: #1f2937; }
.vd-dock-sep { width: 1px; margin: 6px 2px 14px; background: rgba(15, 23, 42, 0.2); }
.vd-icon-yy { overflow: hidden; background: linear-gradient(160deg, #ffe4ef, #e0e7ff); }
.vd-icon-yy img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.vd-dock {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
  padding: 10px 16px 8px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  z-index: 100000;
}
.vd-dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.vd-icon {
  width: 62px;
  height: 62px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
  transition: transform 0.15s;
}
.vd-dock-item:hover .vd-icon { transform: translateY(-6px); }
.vd-icon svg { width: 44px; height: 44px; }
.vd-cal-icon { display: flex; flex-direction: column; align-items: center; line-height: 1; }
.vd-cal-icon em { font-style: normal; font-size: 12px; font-weight: 700; color: #ef4444; text-transform: uppercase; }
.vd-cal-icon b { font-size: 28px; color: #111827; }
.vd-dot { width: 6px; height: 6px; border-radius: 50%; background: transparent; }
.vd-dot.on { background: #374151; }
</style>
