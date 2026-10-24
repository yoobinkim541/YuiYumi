<script setup lang="ts">
// Full-page loading screen shown until the avatar is ready (the encrypted model pack is
// about 12 MB on first visit). Fades out when the Live2D model or its 2D fallback mounts;
// gives up after a while so a stuck load never hides the demo.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Lang } from '@shared/languages'
import { characterView } from '@/character/state'
import { useSettings } from '@/stores/settings'

const MIN_MS = 700
const MAX_MS = 25_000

const settings = useSettings()
const shown = ref(true)
const started = performance.now()
let timer: ReturnType<typeof setTimeout> | undefined

const LABEL: Record<Lang, string> = {
  'en': 'Waking her up',
  'ja': '起こしています',
  'ko': '깨우는 중',
  'zh-Hans': '正在唤醒',
  'zh-Hant': '正在喚醒',
}
const label = computed(() => LABEL[settings.lang] ?? LABEL.en)

function hide() {
  const wait = Math.max(0, MIN_MS - (performance.now() - started))
  clearTimeout(timer)
  timer = setTimeout(() => { shown.value = false }, wait)
}

watch(() => characterView.mode, (m) => { if (m !== 'loading') hide() }, { immediate: true })
onMounted(() => { setTimeout(() => { shown.value = false }, MAX_MS) })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="loading">
    <div v-if="shown" class="loading" role="status" aria-live="polite" :aria-label="label">
      <div class="glow" />
      <div class="mark">
        <span class="ear left" />
        <span class="ear right" />
        <img class="icon" src="/icons/icon-192.png" alt="" draggable="false">
      </div>
      <p class="name">YuiYumi</p>
      <p class="label">{{ label }}<i /><i /><i /></p>
      <div class="bar"><span /></div>
    </div>
  </Transition>
</template>

<style scoped>
.loading {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 40%, #fff6f8 0%, #ffe3ea 45%, #f8c9d6 100%);
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', 'Hiragino Sans', 'PingFang TC', 'PingFang SC', sans-serif;
  color: #6b3a4b;
}
.glow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 65%);
  animation: breathe 2.4s ease-in-out infinite;
}
.mark { position: relative; width: 112px; height: 112px; animation: hop 1.4s cubic-bezier(0.3, 0, 0.3, 1) infinite; }
.icon { position: relative; z-index: 1; width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 14px 30px rgba(190, 70, 105, 0.28); }
/* Bunny ears peeking over the icon, wiggling in turn. */
.ear {
  position: absolute;
  top: -34px;
  width: 22px;
  height: 52px;
  border-radius: 12px 12px 8px 8px;
  background: linear-gradient(180deg, #e2456f 0%, #ffd3df 55%, #ffffff 100%);
  box-shadow: 0 4px 10px rgba(190, 70, 105, 0.2);
  transform-origin: 50% 100%;
}
.ear.left { left: 26px; animation: wiggle-l 1.4s ease-in-out infinite; }
.ear.right { right: 26px; animation: wiggle-r 1.4s ease-in-out infinite 0.18s; }
.name { position: relative; margin: 26px 0 4px; font-size: 22px; font-weight: 700; letter-spacing: 0.02em; color: #c23a62; }
.label { position: relative; margin: 0; font-size: 14px; color: #93606f; }
.label i {
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-left: 3px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
  animation: dot 1.2s ease-in-out infinite;
}
.label i:nth-child(2) { animation-delay: 0.15s; }
.label i:nth-child(3) { animation-delay: 0.3s; }
.bar { position: relative; width: 180px; height: 4px; margin-top: 18px; border-radius: 999px; background: rgba(194, 58, 98, 0.15); overflow: hidden; }
.bar span {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f58ba5, #e2456f);
  animation: slide 1.3s ease-in-out infinite;
}
.loading-leave-active { transition: opacity 0.45s ease, transform 0.45s ease; }
.loading-leave-to { opacity: 0; transform: scale(1.03); }
@keyframes hop { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-14px); } 55% { transform: translateY(0) scale(1.03, 0.97); } }
@keyframes wiggle-l { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(-2deg); } }
@keyframes wiggle-r { 0%, 100% { transform: rotate(12deg); } 50% { transform: rotate(2deg); } }
@keyframes breathe { 0%, 100% { transform: scale(0.92); opacity: 0.7; } 50% { transform: scale(1.05); opacity: 1; } }
@keyframes dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
@keyframes slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }
@media (prefers-reduced-motion: reduce) {
  .mark, .ear, .glow, .label i, .bar span { animation: none; }
}
</style>
