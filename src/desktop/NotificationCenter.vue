<script setup lang="ts">
// Notification banners (top-right, below the menu bar). Part of the captured screen.
import AppIcon from './AppIcon.vue'
import { useDesktopStrings } from './i18n'
import { dismiss, notifications, type Notice } from './notifications'
import { focusWindow } from './windows'

const { t } = useDesktopStrings()

function open(n: Notice) {
  if (n.target) focusWindow(n.target)
  dismiss(n.id)
}
</script>

<template>
  <div class="nc">
    <TransitionGroup name="nc">
      <div v-for="n in notifications.items" :key="n.id" class="nc-banner" role="status" @click="open(n)">
        <AppIcon :app="n.app" :size="44" />
        <div class="nc-text">
          <div class="nc-top"><strong class="nc-title">{{ n.title }}</strong><span>{{ t.now }}</span></div>
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
  top: 52px;
  right: 16px;
  width: 470px;
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
  align-items: center;
  gap: 12px;
  padding: 12px 16px 12px 12px;
  border-radius: 20px;
  background: rgba(246, 246, 250, 0.78);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.14), inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  pointer-events: auto;
  cursor: pointer;
}
.nc-text { flex: 1; min-width: 0; }
.nc-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 14px; color: rgba(60, 60, 67, 0.6); }
.nc-title { font-size: 17px; font-weight: 700; color: #1d1d1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nc-body {
  font-size: 16px;
  color: #1d1d1f;
  line-height: 1.3;
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
