<script setup lang="ts">
// Menu bar extras: Wi-Fi, battery, Control Center and the clock's calendar widget. These are
// part of the user's screen and are captured.
import { computed } from 'vue'
import { useDemo } from '@/stores/demo'
import { useSettings } from '@/stores/settings'
import { hm } from '../format'
import { useDesktopStrings } from '../i18n'
import { focusWindow } from '../windows'
import { systemState } from './bridge'
import { monthGrid, rangeFill, todaysEvents } from './panels'

export type PanelKind = 'wifi' | 'battery' | 'cc' | 'clock'

defineProps<{ kind: PanelKind, right: number }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useDesktopStrings()
const settings = useSettings()
const demo = useDemo()

const CONNECTED = 'Studio-5G'
const OTHERS = [
  { name: 'Cafe_Guest', bars: 2, locked: false },
  { name: 'DIRECT-48-Printer', bars: 1, locked: true },
  { name: 'Neighbor-2.4G', bars: 1, locked: true },
]

function openSettings() {
  systemState.dialog = 'settings'
  emit('close')
}

const now = new Date()
const events = computed(() => todaysEvents(demo.events, now))
const grid = computed(() => monthGrid(now))
const monthTitle = computed(() => now.toLocaleDateString(locale.value, { year: 'numeric', month: 'long' }))
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 1, 1 + i).toLocaleDateString(locale.value, { weekday: 'narrow' })))
const bigWeekday = computed(() => now.toLocaleDateString(locale.value, { weekday: 'long' }))
const next = computed(() => events.value.find(e => new Date(e.end) > now) ?? null)

const brightFill = computed(() => ({ backgroundSize: `${rangeFill(systemState.brightness, 0.35, 1)}% 100%, auto` }))
const volumeFill = computed(() => ({ backgroundSize: `${settings.sound ? rangeFill(systemState.volume, 0, 1) : 0}% 100%, auto` }))

function openCalendar() {
  focusWindow('calendar')
  emit('close')
}
</script>

<template>
  <div class="sp" :class="kind" :style="{ right: `${right}px` }">
    <!-- Wi-Fi -->
    <template v-if="kind === 'wifi'">
      <div class="sp-head">
        <strong>{{ t.mb.wifi }}</strong>
        <button type="button" class="switch" :class="{ on: systemState.wifi }" :aria-pressed="systemState.wifi" @click="systemState.wifi = !systemState.wifi"><i /></button>
      </div>
      <template v-if="systemState.wifi">
        <div class="sp-sep" />
        <div class="sp-label">{{ t.mb.knownNetwork }}</div>
        <div class="net on">
          <span class="net-ico"><svg viewBox="0 0 26 20"><path d="M13 18.2 3.2 7.6a14 14 0 0 1 19.6 0z" /></svg></span>
          <span class="net-name">{{ CONNECTED }}</span>
          <svg class="lock" viewBox="0 0 12 14"><rect x="1.5" y="6" width="9" height="7" rx="1.5" /><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" /></svg>
        </div>
        <div class="sp-sep" />
        <div class="sp-label">{{ t.mb.otherNetworks }}</div>
        <div v-for="n in OTHERS" :key="n.name" class="net">
          <span class="net-ico"><svg viewBox="0 0 26 20"><path d="M13 18.2 3.2 7.6a14 14 0 0 1 19.6 0z" :opacity="n.bars > 1 ? 1 : 0.45" /></svg></span>
          <span class="net-name">{{ n.name }}</span>
          <svg v-if="n.locked" class="lock" viewBox="0 0 12 14"><rect x="1.5" y="6" width="9" height="7" rx="1.5" /><path d="M3.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" /></svg>
        </div>
      </template>
      <div class="sp-sep" />
      <button type="button" class="sp-row" @click="openSettings">{{ t.mb.wifiSettings }}</button>
    </template>

    <!-- Battery -->
    <template v-else-if="kind === 'battery'">
      <div class="sp-head"><strong>{{ t.mb.battery }}</strong><span class="muted">82%</span></div>
      <div class="sp-sep" />
      <div class="sp-text">{{ t.mb.powerSource }} {{ t.mb.powerBattery }}</div>
      <div class="sp-sep" />
      <button type="button" class="sp-row" @click="openSettings">{{ t.mb.batterySettings }}</button>
    </template>

    <!-- Control Center -->
    <template v-else-if="kind === 'cc'">
      <div class="cc-grid">
        <div class="tile conn">
          <button type="button" class="conn-row" @click="systemState.wifi = !systemState.wifi">
            <span class="ccircle" :class="{ on: systemState.wifi }"><svg viewBox="0 0 26 20"><path d="M13 18.2 3.2 7.6a14 14 0 0 1 19.6 0z" /></svg></span>
            <span><b>{{ t.mb.wifi }}</b><small>{{ systemState.wifi ? CONNECTED : t.mb.off }}</small></span>
          </button>
          <button type="button" class="conn-row" @click="systemState.bluetooth = !systemState.bluetooth">
            <span class="ccircle" :class="{ on: systemState.bluetooth }"><svg viewBox="0 0 20 20"><path d="M6 6l8 8-4 3.5V2.5L14 6l-8 8" fill="none" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" /></svg></span>
            <span><b>{{ t.mb.bluetooth }}</b><small>{{ systemState.bluetooth ? t.mb.on : t.mb.off }}</small></span>
          </button>
          <button type="button" class="conn-row" @click="systemState.airdrop = !systemState.airdrop">
            <span class="ccircle" :class="{ on: systemState.airdrop }"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.2" /><path d="M5.8 13.8a6 6 0 1 1 8.4 0M3.6 16a9 9 0 1 1 12.8 0" fill="none" stroke-width="1.6" stroke-linecap="round" /></svg></span>
            <span><b>{{ t.mb.airdrop }}</b><small>{{ systemState.airdrop ? t.mb.contactsOnly : t.mb.off }}</small></span>
          </button>
        </div>
        <div class="side-tiles">
          <div class="tile small">
            <span class="ccircle"><svg viewBox="0 0 20 20"><path d="M14.5 12.5A6.5 6.5 0 0 1 7.5 3.5a6.5 6.5 0 1 0 7 9z" /></svg></span>
            <b>{{ t.mb.focus }}</b>
          </div>
          <div class="tile small">
            <span class="ccircle"><svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="10" rx="1.6" fill="none" stroke-width="1.6" /><path d="M7 17h6" fill="none" stroke-width="1.6" stroke-linecap="round" /></svg></span>
            <b>{{ t.mb.screenMirroring }}</b>
          </div>
        </div>
      </div>
      <div class="tile slider-tile">
        <b>{{ t.mb.display }}</b>
        <div class="slider">
          <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.4" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" fill="none" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input v-model.number="systemState.brightness" type="range" min="0.35" max="1" step="0.01" :style="brightFill" :aria-label="t.mb.display">
        </div>
      </div>
      <div class="tile slider-tile">
        <b>{{ t.mb.sound }}</b>
        <div class="slider">
          <button type="button" class="mute" :class="{ muted: !settings.sound }" :title="t.mb.assistantVoice" @click="settings.sound = !settings.sound">
            <svg viewBox="0 0 20 20"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" /><path v-if="settings.sound" d="M13 7a4 4 0 0 1 0 6M15 5a7 7 0 0 1 0 10" fill="none" stroke-width="1.5" stroke-linecap="round" /><path v-else d="M13 7.5l5 5M18 7.5l-5 5" fill="none" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="settings.sound ? systemState.volume : 0"
            :aria-label="t.mb.sound"
            :style="volumeFill"
            @input="systemState.volume = Number(($event.target as HTMLInputElement).value); settings.sound = systemState.volume > 0"
          >
        </div>
      </div>
    </template>

    <!-- Clock: calendar widget -->
    <template v-else>
      <div class="cal-card">
        <div class="cal-left">
          <div class="cal-wd">{{ bigWeekday }}</div>
          <div class="cal-day">{{ now.getDate() }}</div>
          <div v-if="next" class="cal-next">
            <small>{{ t.mb.upNext }}</small>
            <b>{{ next.title }}</b>
            <span>{{ hm(next.start) }}–{{ hm(next.end) }}</span>
          </div>
        </div>
        <div class="cal-month">
          <div class="cal-mt">{{ monthTitle }}</div>
          <div class="cal-grid">
            <span v-for="(w, i) in weekdays" :key="`w${i}`" class="wd">{{ w }}</span>
            <span v-for="(d, i) in grid" :key="i" :class="{ today: d === now.getDate(), blank: !d }">{{ d || '' }}</span>
          </div>
        </div>
      </div>
      <div class="ev-card">
        <div class="ev-head">{{ t.mb.today }}</div>
        <div v-if="!events.length" class="ev-empty">{{ t.mb.noEvents }}</div>
        <button v-for="e in events.slice(0, 6)" :key="e.id" type="button" class="ev" :class="{ past: new Date(e.end) <= now }" @click="openCalendar">
          <span class="ev-bar" />
          <span class="ev-main"><b>{{ e.title }}</b><small v-if="e.location">{{ e.location }}</small></span>
          <span class="ev-time">{{ hm(e.start) }}<br>{{ hm(e.end) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sp {
  position: absolute;
  top: 40px;
  width: 340px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(236, 236, 241, 0.97);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.26), 0 0 0 0.5px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  font-size: 16px;
  font-weight: 400;
  color: #1d1d1f;
  z-index: 100003;
  user-select: none;
}
.sp.cc { width: 400px; padding: 10px; }
.sp.clock { width: 420px; padding: 10px; background: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; display: flex; flex-direction: column; gap: 10px; }
.sp-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; }
.sp-head strong { font-weight: 700; }
.muted { color: rgba(0, 0, 0, 0.5); }
.sp-sep { height: 1px; margin: 6px 8px; background: rgba(0, 0, 0, 0.1); }
.sp-label { padding: 2px 8px 4px; font-size: 13px; font-weight: 700; color: rgba(0, 0, 0, 0.5); }
.sp-text { padding: 4px 8px; font-size: 15px; color: rgba(0, 0, 0, 0.7); }
.sp-row { display: block; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; font: inherit; color: inherit; text-align: left; cursor: default; }
.sp-row:hover { background: rgba(0, 0, 0, 0.08); }
.switch { position: relative; width: 38px; height: 22px; border: 0; border-radius: 11px; background: rgba(0, 0, 0, 0.18); cursor: pointer; transition: background 0.15s; }
.switch.on { background: #1f6fe5; }
.switch i { position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
.switch.on i { transform: translateX(16px); }
.net { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 8px; border-radius: 6px; }
.net:hover { background: rgba(0, 0, 0, 0.06); }
.net-ico { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(0, 0, 0, 0.1); }
.net-ico svg { width: 16px; height: 13px; fill: #1d1d1f; }
.net.on .net-ico { background: #1f6fe5; }
.net.on .net-ico svg { fill: #fff; }
.net-name { flex: 1; }
.lock { width: 11px; height: 13px; fill: rgba(0, 0, 0, 0.55); stroke: rgba(0, 0, 0, 0.55); stroke-width: 1.4; }
/* Control Center */
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.tile { border-radius: 14px; background: rgba(255, 255, 255, 0.62); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), inset 0 0 0 0.5px rgba(0, 0, 0, 0.06); }
.conn { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; }
.conn-row { display: flex; align-items: center; gap: 10px; padding: 3px 2px; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.conn-row span:last-child { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.conn-row b { font-size: 14px; font-weight: 600; }
.conn-row small { font-size: 12px; color: rgba(0, 0, 0, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ccircle { flex: none; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(0, 0, 0, 0.1); }
.ccircle svg { width: 17px; height: 15px; fill: #1d1d1f; stroke: #1d1d1f; }
.ccircle.on { background: #1f6fe5; }
.ccircle.on svg { fill: #fff; stroke: #fff; }
.side-tiles { display: flex; flex-direction: column; gap: 10px; }
.tile.small { flex: 1; display: flex; align-items: center; gap: 10px; padding: 8px 10px; }
.tile.small b { font-size: 14px; font-weight: 600; line-height: 1.2; }
.slider-tile { padding: 9px 12px 11px; margin-top: 10px; }
.slider-tile b { font-size: 14px; font-weight: 600; }
.slider { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.slider > svg, .mute svg { width: 18px; height: 18px; flex: none; fill: rgba(0, 0, 0, 0.6); stroke: rgba(0, 0, 0, 0.6); }
.mute { display: flex; padding: 0; border: 0; background: transparent; cursor: pointer; }
.mute.muted svg { fill: #d70015; stroke: #d70015; }
.slider input { flex: 1; accent-color: #ffffff; height: 22px; }
.slider input[type='range'] { appearance: none; -webkit-appearance: none; background: linear-gradient(#fff, #fff) no-repeat, rgba(0, 0, 0, 0.22); border-radius: 11px; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.15); }
.slider input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); }
/* Clock widgets */
.cal-card, .ev-card {
  border-radius: 20px;
  background: rgba(244, 244, 248, 0.97);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.14);
}
.cal-card { display: flex; gap: 14px; padding: 16px; }
.cal-left { width: 130px; flex: none; display: flex; flex-direction: column; }
.cal-wd { font-size: 14px; font-weight: 700; color: #ff3b30; text-transform: uppercase; }
.cal-day { font-size: 52px; font-weight: 300; line-height: 1.05; }
.cal-next { margin-top: auto; display: flex; flex-direction: column; border-left: 3px solid #1e88ff; padding-left: 7px; line-height: 1.25; }
.cal-next small { font-size: 11px; color: rgba(0, 0, 0, 0.5); }
.cal-next b { font-size: 13px; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cal-next span { font-size: 12px; color: rgba(0, 0, 0, 0.55); }
.cal-month { flex: 1; }
.cal-mt { font-size: 13px; font-weight: 700; color: #ff3b30; margin-bottom: 4px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px 0; text-align: center; font-size: 12px; }
.cal-grid span { line-height: 22px; }
.cal-grid .wd { font-weight: 700; color: rgba(0, 0, 0, 0.45); font-size: 11px; }
.cal-grid .today { background: #ff3b30; color: #fff; border-radius: 50%; font-weight: 700; width: 22px; justify-self: center; }
.ev-card { padding: 12px 10px; }
.ev-head { font-size: 14px; font-weight: 700; color: rgba(0, 0, 0, 0.55); padding: 0 6px 6px; }
.ev-empty { padding: 6px; font-size: 14px; color: rgba(0, 0, 0, 0.5); }
.ev { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px; border: 0; border-radius: 10px; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.ev:hover { background: rgba(0, 0, 0, 0.06); }
.ev.past { opacity: 0.5; }
.ev-bar { width: 4px; align-self: stretch; border-radius: 2px; background: #1e88ff; }
.ev-main { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.ev-main b { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-main small { font-size: 12px; color: rgba(0, 0, 0, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-time { font-size: 12px; color: rgba(0, 0, 0, 0.55); text-align: right; font-variant-numeric: tabular-nums; }
</style>
