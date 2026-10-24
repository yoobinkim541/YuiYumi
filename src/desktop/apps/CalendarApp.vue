<script setup lang="ts">
import { computed, watch } from 'vue'
import { useDemo, type CalendarEvent } from '@/stores/demo'
import { stage } from '../actuator'
import { hm } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'

const START_H = 8
const END_H = 19
const HOUR_PX = 60

const demo = useDemo()
const { t, locale } = useDesktopStrings()
/** Shown day: today unless the assistant (or the ‹ › buttons) moved it. */
const day = computed(() => (stage.calendarDay ? new Date(stage.calendarDay) : new Date()))
const isToday = computed(() => day.value.toDateString() === new Date().toDateString())
function shiftDay(n: number) {
  const d = new Date(day.value)
  d.setDate(d.getDate() + n)
  stage.calendarDay = d.toDateString() === new Date().toDateString() ? null : d.toISOString()
}
/** Event the assistant just created (highlighted briefly). */
const freshId = computed(() => (stage.reveal?.op === 'calendar_create_event' ? stage.reveal.data.eventId as string | undefined : undefined))

const todays = computed(() =>
  demo.events
    .filter(e => new Date(e.start).toDateString() === day.value.toDateString())
    .sort((a, b) => a.start.localeCompare(b.start)))

interface Placed { ev: CalendarEvent, top: number, height: number, col: number, cols: number, conflict: boolean }

// Greedy column layout; events in an overlapping cluster share the width.
const placed = computed<Placed[]>(() => {
  const evs = todays.value
  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = 0
  const flush = () => {
    const cols = Math.max(1, ...cluster.map(p => p.col + 1))
    for (const p of cluster) { p.cols = cols; p.conflict = cluster.length > 1 }
    out.push(...cluster)
    cluster = []
  }
  for (const ev of evs) {
    const s = new Date(ev.start).getTime()
    const e = new Date(ev.end).getTime()
    if (cluster.length && s >= clusterEnd) flush()
    const used = new Set(cluster.filter(p => new Date(p.ev.end).getTime() > s).map(p => p.col))
    let col = 0
    while (used.has(col)) col++
    const startH = new Date(ev.start).getHours() + new Date(ev.start).getMinutes() / 60
    const durH = (e - s) / 3_600_000
    cluster.push({ ev, top: (startH - START_H) * HOUR_PX, height: Math.max(durH * HOUR_PX, 30), col, cols: 1, conflict: false })
    clusterEnd = Math.max(clusterEnd, e)
  }
  if (cluster.length) flush()
  return out
})

const conflicts = computed(() => placed.value.filter(p => p.conflict))
const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i)
const nowTop = computed(() => {
  if (!isToday.value) return -1
  const n = new Date()
  return (n.getHours() + n.getMinutes() / 60 - START_H) * HOUR_PX
})

const dayTitle = computed(() => day.value.toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' }))
const weekday = computed(() => day.value.toLocaleDateString(locale.value, { weekday: 'long' }))
const nowLabel = computed(() => new Date().toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' }))
function hourLabel(h: number) {
  return new Date(2000, 0, 1, h).toLocaleTimeString(locale.value, { hour: 'numeric' })
}
// macOS Calendar style: one color per calendar; demo events are spread over a few.
const CAL_COLORS = ['#1e88ff', '#a259ff', '#34c759', '#ff9500', '#ff2d55']
function evColor(ev: CalendarEvent) {
  let h = 0
  for (const c of ev.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CAL_COLORS[h % CAL_COLORS.length]!
}
watch([conflicts, isToday, dayTitle], ([c, today, title]) => {
  const label = today ? 'Today' : title
  setWindowTitle('calendar', c.length ? `Calendar — ${label} (${c.length} events overlap)` : `Calendar — ${label}`)
}, { immediate: true })
</script>

<template>
  <div class="cal">
    <div class="toolbar" data-wf-drag>
      <div class="tb-left">
        <span class="tb-icon"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M9 5v14" /></svg></span>
        <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg></span>
      </div>
      <div class="seg">
        <span class="on">{{ t.calendar.day }}</span><span>{{ t.calendar.week }}</span><span>{{ t.calendar.month }}</span><span>{{ t.calendar.year }}</span>
      </div>
      <span class="tb-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg></span>
    </div>
    <div class="cal-head">
      <div>
        <div class="cal-date">{{ dayTitle }}</div>
        <div class="cal-weekday">{{ weekday }}</div>
      </div>
      <div class="nav">
        <button type="button" @click="shiftDay(-1)">‹</button><button type="button" class="today-btn" :class="{ off: isToday }" @click="stage.calendarDay = null">{{ t.calendar.today }}</button><button type="button" @click="shiftDay(1)">›</button>
      </div>
    </div>
    <div v-if="conflicts.length" class="cal-warn">{{ t.calendar.overlapAt(hm(conflicts[0]!.ev.start)) }}</div>
    <div class="allday"><span>{{ t.calendar.allDay }}</span></div>
    <div class="grid" :style="{ height: `${(END_H - START_H) * HOUR_PX}px` }">
      <div v-for="h in hours" :key="h" class="hour" :style="{ top: `${(h - START_H) * HOUR_PX}px` }">
        <span v-if="Math.abs((h - START_H) * HOUR_PX - nowTop) > 16">{{ hourLabel(h) }}</span>
      </div>
      <div v-if="nowTop > 0 && nowTop < (END_H - START_H) * HOUR_PX" class="now" :style="{ top: `${nowTop}px` }">
        <span>{{ nowLabel }}</span>
      </div>
      <div class="events">
        <div
          v-for="p in placed"
          :key="p.ev.id"
          class="event"
          :class="{ conflict: p.conflict, fresh: p.ev.id === freshId }"
          :style="{
            '--c': evColor(p.ev),
            top: `${p.top}px`,
            height: `${p.height - 2}px`,
            left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
            width: `calc(${100 / p.cols}% - 4px)`,
          }"
        >
          <div class="ev-title">{{ p.ev.title }}</div>
          <div v-if="p.height >= 44" class="ev-meta">{{ hm(p.ev.start) }}–{{ hm(p.ev.end) }}<template v-if="p.ev.location"> · {{ p.ev.location }}</template></div>
          <span v-if="p.conflict" class="badge">{{ t.calendar.conflict }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal { height: 100%; display: flex; flex-direction: column; background: #fff; color: #1d1d1f; }
.toolbar { height: 56px; flex: 0 0 56px; display: flex; align-items: center; gap: 12px; padding: 0 14px 0 116px; background: rgba(246, 246, 248, 0.92); border-bottom: 1px solid rgba(0, 0, 0, 0.08); user-select: none; }
.tb-left { display: flex; gap: 2px; }
.tb-icon { width: 34px; height: 30px; display: inline-flex; align-items: center; justify-content: center; color: #5c5c62; }
.tb-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.seg { margin: 0 auto; display: flex; padding: 2px; border-radius: 8px; background: rgba(118, 118, 128, 0.12); font-size: 14px; }
.seg span { padding: 3px 14px; border-radius: 6px; color: #3a3a3c; }
.seg span.on { background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); font-weight: 600; }
.cal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 22px 8px; }
.cal-date { font-size: 30px; font-weight: 700; letter-spacing: -0.01em; }
.cal-weekday { font-size: 17px; color: rgba(60, 60, 67, 0.6); }
.nav { display: flex; align-items: center; gap: 4px; font-size: 15px; }
.nav span { width: 26px; text-align: center; font-size: 22px; color: #5c5c62; }
.nav b { font-weight: 500; padding: 2px 10px; border-radius: 6px; border: 1px solid rgba(0, 0, 0, 0.12); }
.cal-warn { margin: 0 22px 6px; align-self: flex-start; background: rgba(255, 59, 48, 0.12); color: #c4161c; font-weight: 600; padding: 4px 12px; border-radius: 7px; font-size: 15px; }
.allday { margin: 0 0 0 0; padding: 6px 22px; border-top: 1px solid rgba(0, 0, 0, 0.08); border-bottom: 1px solid rgba(0, 0, 0, 0.12); font-size: 13px; color: rgba(60, 60, 67, 0.6); }
.grid { position: relative; margin: 12px 18px 0 22px; }
.hour { position: absolute; left: 70px; right: 0; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.hour span { position: absolute; top: -9px; left: -70px; width: 62px; text-align: right; font-size: 13px; color: rgba(60, 60, 67, 0.55); }
.now { position: absolute; left: 70px; right: 0; border-top: 2px solid #ff3b30; z-index: 3; }
.now::before { content: ''; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: #ff3b30; }
.now span { position: absolute; left: -70px; top: -10px; width: 62px; text-align: right; font-size: 13px; font-weight: 700; color: #ff3b30; background: #fff; }
.events { position: absolute; left: 74px; right: 0; top: 0; bottom: 0; }
.event {
  position: absolute; overflow: hidden; padding: 3px 8px 3px 10px; border-radius: 5px;
  background: color-mix(in srgb, var(--c) 18%, white); color: color-mix(in srgb, var(--c) 70%, black);
}
.event::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--c); }
.event.conflict { box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.55); }
.event.conflict .ev-title { padding-right: 70px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-title { font-size: 16px; font-weight: 600; line-height: 1.25; }
.ev-meta { font-size: 13px; opacity: 0.85; }
.badge { position: absolute; right: 6px; top: 5px; background: #ff3b30; color: #fff; font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
.nav button { border: none; background: none; font: inherit; cursor: pointer; width: 26px; text-align: center; font-size: 22px; color: #5c5c62; }
.nav .today-btn { width: auto; font-size: 15px; color: inherit; font-weight: 500; padding: 2px 10px; border-radius: 6px; border: 1px solid rgba(0, 0, 0, 0.12); }
.event.fresh { box-shadow: 0 0 0 3px rgba(226, 69, 111, 0.55); animation: fresh-pop 0.6s ease-out; }
@keyframes fresh-pop { from { transform: scale(0.96); opacity: 0.4; } to { transform: none; opacity: 1; } }
</style>
