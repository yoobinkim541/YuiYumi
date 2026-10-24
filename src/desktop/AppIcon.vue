<script setup lang="ts">
// Generic squircle app icons for the Dock and notification banners (no vendor artwork).
import { computed } from 'vue'
import { useDesktopStrings } from './i18n'

const props = defineProps<{ app: string, size?: number }>()

const BG: Record<string, string> = {
  mail: 'linear-gradient(180deg,#4fb2ff,#1d6ff2)',
  calendar: 'linear-gradient(180deg,#ffffff,#f1f1f4)',
  slack: 'linear-gradient(180deg,#ffffff,#f4f4f6)',
  discord: 'linear-gradient(180deg,#7b88ff,#5865f2)',
  drive: 'linear-gradient(180deg,#ffffff,#f2f4f7)',
  finder: 'linear-gradient(90deg,#5ac8fa 0 50%,#e8f3fc 50% 100%)',
  trash: 'linear-gradient(180deg,rgba(255,255,255,0.0),rgba(255,255,255,0.0))',
}

const key = computed(() => props.app.toLowerCase())
const now = new Date()
const { locale } = useDesktopStrings()
const month = computed(() => now.toLocaleDateString(locale.value, { month: 'short' }).toUpperCase())
</script>

<template>
  <span class="ai" :class="key" :style="{ width: `${size ?? 64}px`, height: `${size ?? 64}px`, fontSize: `${size ?? 64}px`, background: BG[key] ?? '#9ca3af' }">
    <svg v-if="key === 'mail'" viewBox="0 0 64 64"><rect x="12" y="19" width="40" height="27" rx="4" fill="#fff" /><path d="M13 21l19 14 19-14" stroke="#1d6ff2" stroke-width="3" fill="none" stroke-linejoin="round" /></svg>
    <span v-else-if="key === 'calendar'" class="cal"><em>{{ month }}</em><b>{{ now.getDate() }}</b></span>
    <svg v-else-if="key === 'slack'" viewBox="0 0 64 64"><g stroke-width="7" stroke-linecap="round"><path d="M26 16v18" stroke="#36c5f0" /><path d="M38 30v18" stroke="#2eb67d" /><path d="M16 38h18" stroke="#ecb22e" /><path d="M30 26h18" stroke="#e01e5a" /></g></svg>
    <svg v-else-if="key === 'discord'" viewBox="0 0 64 64"><path d="M18 21c4-3 9-4 14-4s10 1 14 4c3 6 5 13 5 21-4 3-8 5-12 5l-2-4c-3 1-7 1-10 0l-2 4c-4 0-8-2-12-5 0-8 2-15 5-21z" fill="#fff" /><circle cx="25" cy="34" r="3.6" fill="#5865f2" /><circle cx="39" cy="34" r="3.6" fill="#5865f2" /></svg>
    <svg v-else-if="key === 'drive'" viewBox="0 0 64 64"><path d="M24 12h16l16 28H40z" fill="#fbbc04" /><path d="M24 12L8 40l8 13 16-27z" fill="#0f9d58" /><path d="M16 53h32l8-13H24z" fill="#4285f4" /></svg>
    <svg v-else-if="key === 'finder'" viewBox="0 0 64 64"><path d="M32 6c-4 10-6 19-5 30h6" fill="none" stroke="#1d3557" stroke-width="2.6" stroke-linecap="round" /><circle cx="20" cy="24" r="2.6" fill="#1d3557" /><circle cx="44" cy="24" r="2.6" fill="#1d3557" /><path d="M17 42c9 7 21 7 30 0" fill="none" stroke="#1d3557" stroke-width="2.6" stroke-linecap="round" /></svg>
    <svg v-else-if="key === 'trash'" viewBox="0 0 64 64"><path d="M14 16h36l-4 42H18z" fill="rgba(235,238,244,0.92)" stroke="rgba(120,128,140,0.55)" stroke-width="1.2" /><ellipse cx="32" cy="16" rx="18" ry="4" fill="rgba(210,214,222,0.95)" stroke="rgba(120,128,140,0.55)" stroke-width="1.2" /><path d="M22 24l2 28M32 24v28M42 24l-2 28" stroke="rgba(120,128,140,0.45)" stroke-width="1.6" /></svg>
    <b v-else class="letter">{{ app.slice(0, 1) }}</b>
  </span>
</template>

<style scoped>
.ai {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 22.5%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18), inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.ai.trash { box-shadow: none; }
.ai svg { width: 100%; height: 100%; }
.cal { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; line-height: 1; font-family: inherit; }
.cal em { font-style: normal; font-size: 0.2em; font-weight: 700; color: #ff3b30; letter-spacing: 0.04em; }
.cal b { font-size: 0.5em; font-weight: 400; color: #1c1c1e; margin-top: 2px; }
.letter { color: #fff; font-size: 0.45em; }
</style>
