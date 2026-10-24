<script setup lang="ts">
import { computed, watch } from 'vue'
import { useDemo, type CalendarEvent } from '@/stores/demo'
import { hm } from '../format'
import { setWindowTitle } from '../windows'

const START_H = 8
const END_H = 19
const HOUR_PX = 62

const demo = useDemo()
const day = new Date()

const todays = computed(() =>
  demo.events
    .filter(e => new Date(e.start).toDateString() === day.toDateString())
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
const nowTop = computed(() => (day.getHours() + day.getMinutes() / 60 - START_H) * HOUR_PX)

const dayTitle = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
watch(conflicts, c => setWindowTitle('calendar', c.length ? `Calendar — Today (${c.length} events overlap)` : 'Calendar — Today'), { immediate: true })
</script>

<template>
  <div class="cal">
    <div class="cal-head">
      <div>
        <div class="cal-day">Today</div>
        <div class="cal-date">{{ dayTitle }}</div>
      </div>
      <div v-if="conflicts.length" class="cal-warn">Overlap at {{ hm(conflicts[0]!.ev.start) }}</div>
    </div>
    <div class="grid" :style="{ height: `${(END_H - START_H) * HOUR_PX}px` }">
      <div v-for="h in hours" :key="h" class="hour" :style="{ top: `${(h - START_H) * HOUR_PX}px` }">
        <span>{{ String(h).padStart(2, '0') }}:00</span>
      </div>
      <div v-if="nowTop > 0 && nowTop < (END_H - START_H) * HOUR_PX" class="now" :style="{ top: `${nowTop}px` }" />
      <div class="events">
        <div
          v-for="p in placed"
          :key="p.ev.id"
          class="event"
          :class="{ conflict: p.conflict }"
          :style="{
            top: `${p.top}px`,
            height: `${p.height - 3}px`,
            left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
            width: `calc(${100 / p.cols}% - 6px)`,
          }"
        >
          <div class="ev-title">{{ p.ev.title }}</div>
          <div v-if="p.height >= 44" class="ev-meta">{{ hm(p.ev.start) }}–{{ hm(p.ev.end) }}<template v-if="p.ev.location"> · {{ p.ev.location }}</template></div>
          <span v-if="p.conflict" class="badge">Conflict</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal { height: 100%; display: flex; flex-direction: column; padding: 14px 20px 0; }
.cal-head { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 1px solid #eef0f4; }
.cal-day { font-size: 28px; font-weight: 800; color: #ef4444; }
.cal-date { font-size: 18px; color: #4b5563; }
.cal-warn { background: #fee2e2; color: #b91c1c; font-weight: 700; padding: 6px 12px; border-radius: 10px; font-size: 17px; }
.grid { position: relative; margin-top: 14px; }
.hour { position: absolute; left: 0; right: 0; border-top: 1px solid #eef0f4; }
.hour span { position: absolute; top: -11px; left: 0; font-size: 15px; color: #9ca3af; background: #fff; padding-right: 6px; }
.now { position: absolute; left: 60px; right: 0; border-top: 2px solid #ef4444; z-index: 2; }
.now::before { content: ''; position: absolute; left: -6px; top: -6px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; }
.events { position: absolute; left: 66px; right: 4px; top: 0; bottom: 0; }
.event { position: absolute; background: #e0ecff; border-left: 5px solid #3b82f6; border-radius: 8px; padding: 4px 10px; overflow: hidden; color: #1e3a8a; }
.event.conflict .ev-title { padding-right: 76px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event.conflict { background: #fee2e2; border-left-color: #ef4444; color: #7f1d1d; box-shadow: 0 0 0 2px #fca5a5; }
.ev-title { font-size: 17px; font-weight: 700; line-height: 1.25; }
.ev-meta { font-size: 14px; opacity: 0.85; }
.badge { position: absolute; right: 6px; top: 6px; background: #ef4444; color: #fff; font-size: 13px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
</style>
