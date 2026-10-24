<script setup lang="ts">
// Track D: confirmation card for write tools and screen-origin delegation.
// Shows the head of the confirm queue. Rejecting a write means nothing is saved.
import { computed } from 'vue'
import { LANG_INFO } from '@shared/languages'
import { useConfirmQueue } from '@/agent/confirm-queue'
import type { PreviewField } from '@/agent/confirm-queue'
import { AGENT_STRINGS } from '@/agent/strings'
import { stage } from '@/desktop/actuator'
import { desktop, desktopView } from '@/desktop/windows'
import { useSettings } from '@/stores/settings'

const queue = useConfirmQueue()
const settings = useSettings()

const s = computed(() => AGENT_STRINGS[settings.lang])
const card = computed(() => queue.current)
const pending = computed(() => Math.max(0, queue.queue.length - 1))

const opLabel = computed(() => {
  const c = card.value?.card
  if (!c || c.kind !== 'write') return ''
  return (s.value.ops as Record<string, string>)[c.op] ?? c.op
})

const outbound = computed(() => card.value?.card.kind === 'write' && card.value.card.grade === 'outbound')

/**
 * While the agent works in an app window, the card sits over the lower part of that window
 * (page coordinates from the scaled desktop). Otherwise it keeps its default spot.
 */
const CARD_W = 440
const placement = computed<Record<string, string> | undefined>(() => {
  const id = stage.target
  if (!id || card.value?.card.kind !== 'write') return undefined
  const w = desktop.windows[id]
  if (!w?.open) return undefined
  const s = desktopView.scale || 1
  const cx = desktopView.x + (w.x + w.w / 2) * s
  const bottom = desktopView.y + (w.y + w.h) * s - 24 * s
  const left = Math.max(12, Math.min(window.innerWidth - CARD_W - 12, cx - CARD_W / 2))
  return { left: `${left}px`, top: 'auto', bottom: `${Math.max(12, window.innerHeight - bottom)}px`, width: `${CARD_W}px` }
})

function display(f: PreviewField): string {
  if (f.field === 'start' || f.field === 'end' || f.field === 'at') {
    const t = Date.parse(f.value)
    if (!Number.isNaN(t)) {
      return new Intl.DateTimeFormat(LANG_INFO[settings.lang].bcp47, {
        month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
      }).format(t)
    }
  }
  return f.value
}

function answer(accepted: boolean) {
  if (card.value) queue.answer(card.value.id, accepted)
}
</script>

<template>
  <Transition name="confirm">
    <section
      v-if="card"
      :key="card.id"
      class="confirm-card"
      :class="[card.card.kind, { outbound }]"
      :style="placement"
      role="dialog"
      aria-live="polite"
      :aria-label="card.card.kind === 'suggestion' ? s.suggestionTitle : s.writeTitle"
      :lang="LANG_INFO[settings.lang].bcp47"
    >
      <template v-if="card.card.kind === 'suggestion'">
        <header class="title">{{ s.suggestionTitle }}</header>
        <p class="request">{{ card.card.summary || card.card.request }}</p>
      </template>

      <template v-else>
        <header class="title">{{ outbound ? s.outboundTitle : s.writeTitle }}</header>
        <div class="op">{{ opLabel }}</div>
        <dl class="fields">
          <template v-for="(f, i) in card.card.fields" :key="`${f.field}-${i}`">
            <dt>{{ s.fields[f.field] }}</dt>
            <dd :class="{ multiline: f.multiline }">{{ display(f) }}</dd>
          </template>
        </dl>
        <p class="note">{{ outbound ? s.outboundNote : s.writeNote }}</p>
      </template>

      <footer class="actions">
        <span v-if="pending" class="pending">+{{ pending }}</span>
        <button type="button" class="decline" @click="answer(false)">{{ s.decline }}</button>
        <button type="button" class="accept" @click="answer(true)">
          {{ card.card.kind === 'write' ? (outbound ? s.acceptOutbound : s.acceptWrite) : s.accept }}
        </button>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
/* Centered in the area left of the character (bottom-right ~520x780), near the bottom. */
.confirm-card {
  --char-w: 520px;
  --card-w: min(440px, calc(100vw - var(--char-w) - 32px));
  position: fixed;
  z-index: 60;
  bottom: 112px;
  left: max(16px, calc((100vw - var(--char-w) - var(--card-w)) / 2));
  width: var(--card-w);
  min-width: 300px;
  max-height: min(60vh, 520px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px 16px;
  box-sizing: border-box;
  border-radius: 16px;
  background: #fbfbfd;
  color: #1b1d22;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.06);
  font-size: 15px;
  line-height: 1.5;
}
.confirm-card.write { border-top: 4px solid #e0a43a; }
.confirm-card.suggestion { border-top: 4px solid #6c8cff; }
.confirm-card.outbound { border-top-color: #e2456f; }

.title { font-weight: 700; font-size: 16px; }
.request { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.op { font-size: 13px; font-weight: 600; color: #6b6f7a; text-transform: none; }

.fields {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  overflow: auto;
  min-height: 0;
}
.fields dt { color: #6b6f7a; font-size: 13px; padding-top: 1px; }
.fields dd { margin: 0; overflow-wrap: anywhere; }
.fields dd.multiline {
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f0f1f5;
  font-size: 14px;
}

.note { margin: 0; font-size: 12px; color: #6b6f7a; }

.actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.pending { margin-right: auto; font-size: 12px; color: #6b6f7a; }
button {
  font: inherit;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
}
.decline { background: transparent; border-color: #c9ccd4; color: #1b1d22; }
.decline:hover { background: #eef0f4; }
.accept { background: #3a5bff; color: #fff; }
.accept:hover { background: #2c49dd; }
button:focus-visible { outline: 2px solid #3a5bff; outline-offset: 2px; }

.confirm-enter-active, .confirm-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.confirm-enter-from, .confirm-leave-to { opacity: 0; transform: translateY(12px); }
</style>
