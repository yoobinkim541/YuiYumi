<script setup lang="ts">
// Notification banners (top-right, below the menu bar). Part of the captured screen.
import { dismiss, notifications, type Notice } from './notifications'
import { focusWindow } from './windows'

const ICON_BG: Record<string, string> = {
  Slack: 'linear-gradient(160deg,#7c3a8f,#4a154b)',
  Mail: 'linear-gradient(160deg,#5aa9ff,#1e6bff)',
  Calendar: 'linear-gradient(160deg,#ffffff,#eef0f4)',
  Discord: 'linear-gradient(160deg,#7d8bff,#5865f2)',
  Drive: 'linear-gradient(160deg,#34d399,#0f9d58)',
}

function open(n: Notice) {
  if (n.target) focusWindow(n.target)
  dismiss(n.id)
}
</script>

<template>
  <div class="nc">
    <TransitionGroup name="nc">
      <div v-for="n in notifications.items" :key="n.id" class="nc-banner" role="status" @click="open(n)">
        <span class="nc-icon" :style="{ background: ICON_BG[n.app] ?? '#9ca3af' }">{{ n.app.slice(0, 1) }}</span>
        <div class="nc-text">
          <div class="nc-top"><strong>{{ n.app.toUpperCase() }}</strong><span>now</span></div>
          <div class="nc-title">{{ n.title }}</div>
          <div class="nc-body">{{ n.body }}</div>
        </div>
        <button type="button" class="nc-close" aria-label="Dismiss" @click.stop="dismiss(n.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.nc {
  position: absolute;
  top: 54px;
  right: 18px;
  width: 460px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Below the menu bar (100000) so tray dropdowns stay on top. */
  z-index: 99999;
  pointer-events: none;
}
.nc-banner {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(246, 246, 248, 0.86);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.08);
  pointer-events: auto;
  cursor: pointer;
}
.nc-icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 22px;
}
.nc-text { flex: 1; min-width: 0; }
.nc-top { display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; letter-spacing: 0.02em; }
.nc-title { font-size: 17px; font-weight: 600; color: #111827; margin-top: 2px; }
.nc-body {
  font-size: 16px;
  color: #374151;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nc-close {
  position: absolute;
  left: -8px;
  top: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 0;
  background: rgba(240, 240, 242, 0.95);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  font-size: 15px;
  line-height: 22px;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}
.nc-banner:hover .nc-close { opacity: 1; }
.nc-enter-active, .nc-leave-active { transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.1), opacity 0.3s; }
.nc-enter-from { transform: translateX(520px); }
.nc-leave-to { opacity: 0; transform: translateX(40px); }
</style>
