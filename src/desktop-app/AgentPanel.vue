<script setup lang="ts">
// Agent transcript panel (desktop app): user turns, assistant text, collapsible tool steps,
// permission prompts with Allow / Deny, a working indicator and a composer. State lives in
// the controller from agent-bridge.ts; the character reacts through the bus on its own.
// Look follows the settings/dashboard windows (theme.css, adapted from AIRI, MIT).

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { LANG_INFO, type Lang } from '@shared/languages'
import '@/settings/theme.css'
import type { AgentController, TranscriptItem } from './agent-bridge'

const props = defineProps<{ controller: AgentController, lang: Lang }>()

const s = computed(() => props.controller.strings())
const state = computed(() => props.controller.state)
const draft = ref('')
const open = ref(new Set<string>())
const scroller = ref<HTMLElement | null>(null)
const now = ref(Date.now())

const folder = computed(() => state.value.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? '')
const modelLabel = computed(() => (state.value.model ?? '').replace(/^claude-/, ''))
const waiting = computed(() => state.value.items.some(i => i.kind === 'permission' && i.status === 'pending'))

// Countdown on open permission prompts.
let tick: ReturnType<typeof setInterval> | undefined
watch(waiting, (w) => {
  clearInterval(tick)
  if (w) tick = setInterval(() => { now.value = Date.now() }, 1000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(tick))

// Follow the transcript while the user is near the bottom.
watch(() => state.value.items.length, async () => {
  const el = scroller.value
  const stick = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  await nextTick()
  if (stick && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
})

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

/** Splits text on ``` fences into prose and code segments. */
function segments(text: string): { code: boolean, text: string }[] {
  return text.split(/```[^\n]*\n?/).map((t, i) => ({ code: i % 2 === 1, text: i % 2 === 1 ? t.replace(/\n$/, '') : t.trim() })).filter(p => p.text)
}

function secondsLeft(item: Extract<TranscriptItem, { kind: 'permission' }>) {
  return Math.max(0, Math.ceil((item.expiresAt - now.value) / 1000))
}

function submit() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  void props.controller.ask(text)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="yy-airi agent-panel" :lang="LANG_INFO[lang].bcp47">
    <header class="ap-head">
      <div class="ap-title">
        <b>{{ s.title }}</b>
        <span v-if="folder" class="badge" :title="state.cwd ?? ''">{{ folder }}</span>
        <span v-if="modelLabel" class="badge primary">{{ modelLabel }}</span>
      </div>
      <button v-if="state.items.length" class="btn" type="button" :disabled="state.busy" @click="controller.reset()">{{ s.newTask }}</button>
    </header>

    <div ref="scroller" class="ap-log scroll">
      <p v-if="!state.items.length" class="ap-empty">{{ s.empty }}</p>
      <template v-for="item in state.items" :key="item.kind + item.id">
        <div v-if="item.kind === 'user'" class="ap-user">{{ item.text }}</div>

        <div v-else-if="item.kind === 'text'" class="ap-text" :class="{ sub: item.parentId }">
          <blockquote v-for="(line, i) in item.say" :key="i" class="ap-say">{{ line }}</blockquote>
          <template v-for="(seg, i) in segments(item.text)" :key="i">
            <pre v-if="seg.code" class="ap-code">{{ seg.text }}</pre>
            <p v-else>{{ seg.text }}</p>
          </template>
        </div>

        <div v-else-if="item.kind === 'tool'" class="ap-tool" :class="[item.status, { sub: item.parentId }]">
          <button class="ap-tool-row" type="button" :aria-expanded="open.has(item.id)" @click="toggle(item.id)">
            <span class="ap-state" aria-hidden="true" />
            <span class="ap-grade" :data-grade="item.grade">{{ s.grade[item.grade] }}</span>
            <span class="ap-name">{{ item.name }}</span>
            <span class="ap-sum">{{ item.summary }}</span>
            <span v-if="item.output" class="ap-chev" :class="{ on: open.has(item.id) }" aria-hidden="true" />
          </button>
          <pre v-if="open.has(item.id) && item.output" class="ap-out">{{ item.output }}</pre>
        </div>

        <div v-else-if="item.kind === 'permission'" class="ap-perm" :class="item.status" :data-grade="item.grade">
          <div class="ap-perm-head">
            <b>{{ s.ask[item.grade] }}</b>
            <span v-if="item.status === 'pending'" class="ap-left">{{ s.secondsLeft(secondsLeft(item)) }}</span>
          </div>
          <div class="ap-perm-body">
            <span class="ap-name">{{ item.tool }}</span>
            <code>{{ item.summary || item.title }}</code>
          </div>
          <div v-if="item.status === 'pending'" class="ap-perm-actions">
            <button class="btn danger" type="button" @click="controller.answer(item.id, false)">{{ s.deny }}</button>
            <button class="btn primary" type="button" @click="controller.answer(item.id, true)">{{ s.allow }}</button>
          </div>
          <div v-else class="ap-perm-done">{{ item.status === 'allowed' ? s.allowed : item.status === 'expired' ? s.expired : s.denied }}</div>
        </div>

        <div v-else-if="item.kind === 'result'" class="ap-result" :class="{ bad: !item.ok }">
          {{ item.ok ? s.done(Math.round(item.durationMs / 1000), item.costUsd) : item.subtype === 'cancelled' ? s.cancelled : s.failed }}
        </div>

        <div v-else-if="item.kind === 'error'" class="ap-error">{{ item.text }}</div>
      </template>

      <div v-if="state.busy" class="ap-working" role="status">
        <span class="ap-dots" aria-hidden="true"><i /><i /><i /></span>
        {{ waiting ? s.waiting : s.working }}
      </div>
    </div>

    <form class="ap-compose" @submit.prevent="submit">
      <textarea v-model="draft" rows="2" :placeholder="s.placeholder" @keydown="onKey" />
      <button v-if="state.busy && state.sessionId" class="btn" type="button" @click="controller.cancel()">{{ s.stop }}</button>
      <button class="btn primary" type="submit" :disabled="!draft.trim()">{{ s.send }}</button>
    </form>
  </div>
</template>

<style scoped>
.agent-panel { flex-direction: column; background: #fff; }
.ap-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--n100); }
.ap-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ap-title b { font-weight: 500; font-size: 15px; color: var(--n900); }
.ap-title .badge { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ap-log { flex: 1; min-height: 0; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.ap-empty { margin: auto; max-width: 280px; text-align: center; color: var(--n500); font-size: 13px; }

.ap-user { align-self: flex-end; max-width: 85%; background: var(--p50); border: 1px solid var(--p100); color: var(--n800); border-radius: 12px 12px 4px 12px; padding: 7px 11px; white-space: pre-wrap; word-break: break-word; }
.ap-text { max-width: 100%; color: var(--n800); }
.ap-text p { margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
.ap-text p:last-child { margin-bottom: 0; }
.ap-say { margin: 0 0 6px; padding: 2px 0 2px 10px; border-left: 3px solid var(--p300); color: var(--p600); font-size: 13px; }
.ap-code, .ap-out { margin: 4px 0; padding: 8px 10px; background: var(--n50); border: 1px solid var(--n100); border-radius: 8px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
.sub { margin-left: 18px; }

.ap-tool { border: 1px solid var(--n100); border-radius: 8px; background: var(--n50); }
.ap-tool-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; background: none; border: 0; font: inherit; font-size: 12.5px; color: var(--n700); cursor: pointer; text-align: left; }
.ap-tool .ap-out { margin: 0 8px 8px; background: #fff; }
.ap-state { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--n300); }
.ap-tool.running .ap-state { background: var(--p400); animation: ap-pulse 1s ease-in-out infinite; }
.ap-tool.ok .ap-state { background: #22c55e; }
.ap-tool.error .ap-state { background: #ef4444; }
.ap-grade { flex: none; font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 999px; background: var(--n100); color: var(--n600); }
.ap-grade[data-grade=write] { background: #fef3c7; color: #a16207; }
.ap-grade[data-grade=shell], .ap-grade[data-grade=outbound] { background: #fee2e2; color: #b91c1c; }
.ap-grade[data-grade=network] { background: var(--p100); color: var(--p600); }
.ap-name { flex: none; font-weight: 500; color: var(--n800); }
.ap-sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--n500); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.ap-chev { flex: none; width: 7px; height: 7px; border-right: 1.5px solid var(--n400); border-bottom: 1.5px solid var(--n400); transform: rotate(-45deg); transition: transform .2s; }
.ap-chev.on { transform: rotate(45deg); }

.ap-perm { border: 2px solid var(--p300); border-radius: 10px; padding: 10px 12px; background: #fff; display: flex; flex-direction: column; gap: 8px; }
.ap-perm[data-grade=shell], .ap-perm[data-grade=outbound] { border-color: #fca5a5; }
.ap-perm:not(.pending) { border-width: 1px; border-color: var(--n200); opacity: .8; }
.ap-perm-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ap-perm-head b { font-weight: 500; color: var(--n900); }
.ap-left { font-size: 12px; color: var(--n500); font-variant-numeric: tabular-nums; }
.ap-perm-body { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.ap-perm-body code { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--n50); border-radius: 6px; padding: 6px 8px; white-space: pre-wrap; word-break: break-all; }
.ap-perm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ap-perm-done { font-size: 12px; color: var(--n500); }

.ap-result { align-self: center; font-size: 12px; color: var(--n500); }
.ap-result.bad { color: #b91c1c; }
.ap-error { font-size: 13px; color: #b91c1c; background: #fef2f2; border-radius: 8px; padding: 8px 10px; }

.ap-working { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--n500); }
.ap-dots { display: inline-flex; gap: 3px; }
.ap-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--p400); animation: ap-bounce 1.2s infinite ease-in-out; }
.ap-dots i:nth-child(2) { animation-delay: .15s; }
.ap-dots i:nth-child(3) { animation-delay: .3s; }

.ap-compose { display: flex; align-items: flex-end; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--n100); }
.ap-compose textarea { flex: 1; min-height: 40px; max-height: 140px; resize: none; }

@keyframes ap-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }
@keyframes ap-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .ap-dots i, .ap-tool.running .ap-state { animation: none; } }
</style>
