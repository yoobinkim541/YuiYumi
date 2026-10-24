<script setup lang="ts">
// Speech bubble above the character. Shows `bubble` events and hides after ttlMs.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { bus } from '@/core/bus'

const DEFAULT_TTL_MS = 5000

const text = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
let off: (() => void) | null = null

function clear() {
  if (timer) clearTimeout(timer)
  timer = null
}

onMounted(() => {
  off = bus.on('bubble', (payload) => {
    clear()
    if (!payload || !payload.text) {
      text.value = null
      return
    }
    text.value = payload.text
    timer = setTimeout(() => { text.value = null }, payload.ttlMs ?? DEFAULT_TTL_MS)
  })
})

onBeforeUnmount(() => {
  clear()
  off?.()
})
</script>

<template>
  <Transition name="bubble">
    <div v-if="text" :key="text" class="speech-bubble" role="status" aria-live="polite">
      {{ text }}
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
</style>
