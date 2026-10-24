<script setup lang="ts">
// System-level layers opened from the system menu and Control Center: brightness dimming,
// sleep / restart fades, the lock screen and the About / System Settings dialogs.
import { computed, ref } from 'vue'
import { useDemo } from '@/stores/demo'
import AppIcon from '../AppIcon.vue'
import { displayName, initials } from '../format'
import { useDesktopStrings } from '../i18n'
import { systemState, unlockScreen } from './bridge'

const props = defineProps<{ now: Date }>()

const { t, locale } = useDesktopStrings()
const demo = useDemo()
const user = computed(() => displayName(demo.mails[0]?.to ?? 'User'))

const lockTime = computed(() => props.now.toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, ''))
const lockDate = computed(() => props.now.toLocaleDateString(locale.value, { weekday: 'long', month: 'long', day: 'numeric' }))

type Pane = 'wifi' | 'bluetooth' | 'network' | 'displays' | 'sound' | 'battery' | 'general'
const pane = ref<Pane>('wifi')
const panes = computed<{ id: Pane, label: string, color: string }[]>(() => [
  { id: 'wifi', label: t.value.mb.wifi, color: '#1f6fe5' },
  { id: 'bluetooth', label: t.value.mb.bluetooth, color: '#1f6fe5' },
  { id: 'network', label: t.value.mb.network, color: '#1f6fe5' },
  { id: 'displays', label: t.value.mb.displays, color: '#2f7cf6' },
  { id: 'sound', label: t.value.mb.sound, color: '#ff375f' },
  { id: 'battery', label: t.value.mb.battery, color: '#34c759' },
  { id: 'general', label: t.value.mb.general, color: '#8e8e93' },
])
const paneLabel = computed(() => panes.value.find(p => p.id === pane.value)?.label ?? '')

function closeDialog() {
  systemState.dialog = 'none'
}
</script>

<template>
  <!-- Display brightness (Control Center). -->
  <div v-if="systemState.brightness < 1" class="so-dim" :style="{ opacity: (1 - systemState.brightness) * 0.85 }" />

  <!-- About This PC -->
  <div v-if="systemState.dialog === 'about'" class="so-dialog about" role="dialog">
    <div class="so-lights"><button type="button" class="so-close" aria-label="Close" @click="closeDialog" /><i /><i /></div>
    <div class="about-art">
      <svg viewBox="0 0 120 80"><rect x="14" y="6" width="92" height="58" rx="6" fill="#1d1d1f" /><rect x="18" y="10" width="84" height="50" rx="3" fill="url(#so-grad)" /><path d="M4 66h112l-6 8H10z" fill="#c7c7cc" /><defs><linearGradient id="so-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fb8ff" /><stop offset="0.6" stop-color="#d9a6ff" /><stop offset="1" stop-color="#ffb8c6" /></linearGradient></defs></svg>
    </div>
    <div class="about-name">YuiBook Air</div>
    <div class="about-sub">14-inch, 2026</div>
    <dl class="about-specs">
      <dt>{{ t.mb.chip }}</dt><dd>Y2 Pro</dd>
      <dt>{{ t.mb.memory }}</dt><dd>16 GB</dd>
      <dt>{{ t.mb.startupDisk }}</dt><dd>Yui HD</dd>
      <dt>{{ t.mb.serial }}</dt><dd>YY26DEMO0824</dd>
      <dt>{{ t.mb.version }}</dt><dd>YuiOS 1.0</dd>
    </dl>
    <button type="button" class="so-btn">{{ t.mb.moreInfo }}</button>
  </div>

  <!-- About <App> -->
  <div v-else-if="systemState.dialog === 'app'" class="so-dialog app-about" role="dialog">
    <div class="so-lights"><button type="button" class="so-close" aria-label="Close" @click="closeDialog" /><i /><i /></div>
    <AppIcon :app="systemState.dialogApp.icon" :size="96" />
    <div class="about-name">{{ systemState.dialogApp.name }}</div>
    <div class="about-sub">{{ t.mb.version }} 1.0 (2026)</div>
  </div>

  <!-- System Settings (fictional) -->
  <div v-else-if="systemState.dialog === 'settings'" class="so-dialog settings" role="dialog">
    <aside class="set-side">
      <div class="so-lights"><button type="button" class="so-close" aria-label="Close" @click="closeDialog" /><i /><i /></div>
      <div class="set-user"><span class="set-avatar">{{ initials(user) }}</span><span>{{ user }}</span></div>
      <button v-for="p in panes" :key="p.id" type="button" class="set-item" :class="{ on: pane === p.id }" @click="pane = p.id">
        <span class="set-ico" :style="{ background: p.color }" />{{ p.label }}
      </button>
    </aside>
    <section class="set-main">
      <h2>{{ paneLabel }}</h2>
      <div class="set-group">
        <template v-if="pane === 'wifi' || pane === 'bluetooth'">
          <div class="set-row">
            <span>{{ paneLabel }}</span>
            <button
              type="button" class="switch"
              :class="{ on: pane === 'wifi' ? systemState.wifi : systemState.bluetooth }"
              @click="pane === 'wifi' ? (systemState.wifi = !systemState.wifi) : (systemState.bluetooth = !systemState.bluetooth)"
            ><i /></button>
          </div>
          <div v-if="pane === 'wifi' && systemState.wifi" class="set-row"><span>Studio-5G</span><span class="ok">●</span></div>
        </template>
        <div v-else-if="pane === 'displays'" class="set-row">
          <span>{{ t.mb.display }}</span>
          <input v-model.number="systemState.brightness" type="range" min="0.35" max="1" step="0.01">
        </div>
        <div v-else-if="pane === 'sound'" class="set-row">
          <span>{{ t.mb.sound }}</span>
          <input v-model.number="systemState.volume" type="range" min="0" max="1" step="0.01">
        </div>
        <div v-else-if="pane === 'battery'" class="set-row"><span>{{ t.mb.battery }}</span><span>82%</span></div>
        <template v-else>
          <div class="set-row"><span>{{ t.mb.version }}</span><span>YuiOS 1.0</span></div>
          <div class="set-row"><span>{{ t.mb.chip }}</span><span>Y2 Pro</span></div>
        </template>
      </div>
    </section>
  </div>

  <!-- Sleep / Restart / Lock -->
  <Transition name="so-fade">
    <div v-if="systemState.overlay === 'sleep'" class="so-black" />
    <div v-else-if="systemState.overlay === 'restart'" class="so-black restart">
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2" /><circle cx="10" cy="10" r="2.4" class="fill" /></svg>
      <div class="so-progress"><i /></div>
    </div>
    <div v-else-if="systemState.overlay === 'lock'" class="so-lock" @click="unlockScreen">
      <div class="lock-date">{{ lockDate }}</div>
      <div class="lock-time">{{ lockTime }}</div>
      <div class="lock-user">
        <span class="lock-avatar">{{ initials(user) }}</span>
        <b>{{ user }}</b>
        <span class="lock-hint">{{ t.mb.clickToUnlock }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.so-dim { position: absolute; inset: 0; background: #000; pointer-events: none; z-index: 200000; }
.so-dialog {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  border-radius: 14px;
  background: rgba(246, 246, 248, 0.97);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.32), 0 0 0 0.5px rgba(0, 0, 0, 0.25);
  color: #1d1d1f;
  z-index: 99990;
}
.so-lights { position: absolute; left: 18px; top: 16px; display: flex; gap: 9px; }
.so-lights i, .so-close { width: 14px; height: 14px; border-radius: 50%; border: 0; padding: 0; background: #dcdcde; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.2); }
.so-close { background: #ff5f57; cursor: pointer; }
.about, .app-about { width: 400px; padding: 44px 30px 26px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.about-art svg { width: 170px; height: 114px; }
.about-name { margin-top: 12px; font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
.about-sub { font-size: 15px; color: rgba(0, 0, 0, 0.5); margin-top: 2px; }
.about-specs { display: grid; grid-template-columns: auto auto; gap: 5px 14px; margin: 20px 0; font-size: 14px; }
.about-specs dt { text-align: right; font-weight: 600; }
.about-specs dd { margin: 0; text-align: left; color: rgba(0, 0, 0, 0.65); }
.so-btn { padding: 4px 16px; border-radius: 7px; border: 0; background: #fff; box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.3); font: inherit; font-size: 14px; }
.app-about :deep(.ai) { margin-top: 6px; }
.settings { width: 820px; height: 540px; display: flex; overflow: hidden; }
.set-side { position: relative; width: 250px; flex: none; padding: 54px 10px 10px; background: rgba(232, 232, 238, 0.9); border-right: 1px solid rgba(0, 0, 0, 0.08); display: flex; flex-direction: column; gap: 2px; }
.set-user { display: flex; align-items: center; gap: 10px; padding: 6px 8px 12px; font-size: 15px; font-weight: 600; }
.set-avatar, .lock-avatar { display: flex; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(160deg, #a5b4fc, #f0abfc); color: #fff; font-weight: 700; }
.set-avatar { width: 36px; height: 36px; font-size: 16px; }
.set-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 0; border-radius: 7px; background: transparent; font: inherit; font-size: 15px; color: inherit; text-align: left; cursor: default; }
.set-item.on { background: #1f6fe5; color: #fff; }
.set-ico { width: 22px; height: 22px; border-radius: 6px; flex: none; }
.set-main { flex: 1; padding: 18px 24px; background: #f5f5f7; }
.set-main h2 { margin: 0 0 16px; font-size: 20px; }
.set-group { border-radius: 10px; background: #fff; box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12); }
.set-row { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 16px; font-size: 15px; }
.set-row + .set-row { border-top: 1px solid rgba(0, 0, 0, 0.07); }
.set-row input { width: 260px; }
.ok { color: #34c759; }
.switch { position: relative; width: 38px; height: 22px; border: 0; border-radius: 11px; background: rgba(0, 0, 0, 0.18); cursor: pointer; }
.switch.on { background: #1f6fe5; }
.switch i { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
.switch.on i { transform: translateX(16px); }
.so-black { position: absolute; inset: 0; background: #000; z-index: 210000; cursor: none; }
.so-black.restart { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 46px; }
.so-black.restart svg { width: 110px; height: 110px; fill: none; stroke: #fff; stroke-width: 1.6; }
.so-black.restart svg .fill { fill: #fff; stroke: none; }
.so-progress { width: 220px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.25); overflow: hidden; }
.so-progress i { display: block; height: 100%; width: 0; background: #fff; border-radius: 3px; animation: so-load 2.4s 0.4s ease-in-out forwards; }
@keyframes so-load { to { width: 100%; } }
.so-lock {
  position: absolute;
  inset: 0;
  z-index: 210000;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 110px;
  color: #fff;
  background: linear-gradient(160deg, rgba(110, 124, 240, 0.55), rgba(217, 166, 255, 0.5) 55%, rgba(255, 184, 198, 0.55));
  backdrop-filter: blur(40px) saturate(140%);
  -webkit-backdrop-filter: blur(40px) saturate(140%);
  cursor: pointer;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.18);
}
.lock-date { font-size: 28px; font-weight: 600; }
.lock-time { font-size: 150px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
.lock-user { margin-top: auto; margin-bottom: 120px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.lock-avatar { width: 84px; height: 84px; font-size: 34px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); }
.lock-user b { font-size: 22px; }
.lock-hint { font-size: 16px; opacity: 0.8; }
.so-fade-enter-active { transition: opacity 0.45s ease; }
.so-fade-leave-active { transition: opacity 0.6s ease; }
.so-fade-enter-from, .so-fade-leave-to { opacity: 0; }
</style>
