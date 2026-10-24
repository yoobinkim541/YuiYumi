<script setup lang="ts">
// Small card the character shows when the agent worked on sample data for a service the user
// could connect (connect-prompt.ts). Place it near the character; it hides itself after a while.

import { computed, onBeforeUnmount, watch } from 'vue'
import { connectPrompt, dismissConnect } from './connect-prompt'
import { providerTitle, useConnectorStrings } from './i18n'
import { connectUrl } from './live-client'

const props = withDefaults(defineProps<{ autoHideMs?: number }>(), { autoHideMs: 15_000 })

const t = useConnectorStrings()
const text = computed(() => {
  const p = connectPrompt.provider
  if (!p) return ''
  const name = providerTitle(p)
  return connectPrompt.reason === 'expired'
    ? t.value.prompt.expired(name)
    : t.value.prompt.needed(name, connectPrompt.service ? t.value.services[connectPrompt.service] : name)
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(() => connectPrompt.provider, (p) => {
  clearTimeout(timer)
  if (p && props.autoHideMs > 0) timer = setTimeout(dismissConnect, props.autoHideMs)
})
onBeforeUnmount(() => clearTimeout(timer))

function connect() {
  const p = connectPrompt.provider
  if (p) location.href = connectUrl(p)
}
</script>

<template>
  <Transition name="yy-connect">
    <div v-if="connectPrompt.provider" class="yy-connect-prompt" role="dialog" aria-live="polite">
      <p>{{ text }}</p>
      <div class="actions">
        <button type="button" class="later" @click="dismissConnect">{{ t.prompt.later }}</button>
        <button type="button" class="go" @click="connect">{{ t.prompt.connect }} {{ providerTitle(connectPrompt.provider) }}</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.yy-connect-prompt {
  max-width: 280px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #262626;
  box-shadow: 0 8px 24px rgb(0 0 0 / .16); font-size: 13px; line-height: 1.5; pointer-events: auto;
}
.yy-connect-prompt p { margin: 0 0 10px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button { font: inherit; font-size: 12.5px; border-radius: 8px; padding: 5px 10px; cursor: pointer; border: 1.5px solid #e5e5e5; background: #fff; color: #404040; }
.actions .go { background: #22a9d2; border-color: #22a9d2; color: #fff; }
.actions .go:hover { background: #1789ad; border-color: #1789ad; }
.yy-connect-enter-active, .yy-connect-leave-active { transition: opacity .2s, transform .2s; }
.yy-connect-enter-from, .yy-connect-leave-to { opacity: 0; transform: translateY(6px); }
</style>
