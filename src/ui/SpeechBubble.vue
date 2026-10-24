<script setup lang="ts">
// Speech bubble above the character. Shows `bubble` events and hides after ttlMs.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { bus } from '@/core/bus'

const DEFAULT_TTL_MS = 5000

const text = ref<string | null>(null)
/** "..." while a reply is being generated (STT, observer, agent, TTS latency). */
const thinking = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let thinkTimer: ReturnType<typeof setTimeout> | null = null
const offs: (() => void)[] = []
// Longest wait shown before giving up (e.g. the observer chose to stay silent).
const THINK_MAX_MS = 15000

function think(on: boolean) {
  if (thinkTimer) clearTimeout(thinkTimer)
  thinkTimer = null
  thinking.value = on
  if (on) thinkTimer = setTimeout(() => { thinking.value = false }, THINK_MAX_MS)
}

function clear() {
  if (timer) clearTimeout(timer)
  timer = null
}

onMounted(() => {
  offs.push(bus.on('voice:speech-end', () => think(true)))
  offs.push(bus.on('voice:transcript', t => { if (!t.text.trim()) think(false) }))
  offs.push(bus.on('agent:busy', ({ busy }) => think(busy)))
  offs.push(bus.on('character:react', r => { if (r.line) think(false) }))
  offs.push(bus.on('thinking', ({ on }) => think(on)))
  offs.push(bus.on('bubble', (payload) => {
    clear()
    if (payload?.text) think(false)
    if (!payload || !payload.text) {
      text.value = null
      return
    }
    text.value = payload.text
    timer = setTimeout(() => { text.value = null }, payload.ttlMs ?? DEFAULT_TTL_MS)
  }))
})

onBeforeUnmount(() => {
  clear()
  think(false)
  offs.forEach(f => f())
})
</script>

<template>
  <Transition name="bubble" mode="out-in">
    <div v-if="text" :key="text" class="speech-bubble" role="status" aria-live="polite">
      {{ text }}
    </div>
    <div v-else-if="thinking" key="thinking" class="speech-bubble typing" role="status" aria-label="…">
      <i /><i /><i />
    </div>
  </Transition>
</template>

<style scoped>
.speech-bubble {
  position: relative;
  max-width: 320px;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: #2a2230;
  font-size: 15px;
  line-height: 1.45;
  box-shadow: 0 6px 20px rgba(40, 20, 60, 0.18);
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.speech-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%);
  border: 10px solid transparent;
  border-top-color: rgba(255, 255, 255, 0.96);
  border-bottom: 0;
}
.bubble-enter-active, .bubble-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bubble-enter-from, .bubble-leave-to { opacity: 0; transform: translateY(6px) scale(0.97); }
.speech-bubble.typing { display: flex; gap: 6px; align-items: center; padding: 14px 18px; }
.speech-bubble.typing i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9a8fab;
  animation: typing-dot 1.2s ease-in-out infinite;
}
.speech-bubble.typing i:nth-child(2) { animation-delay: 0.15s; }
.speech-bubble.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-5px); opacity: 1; }
}
</style>
