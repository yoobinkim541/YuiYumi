// Queue of confirmation cards. Callers await requestConfirm(card); the ConfirmCard
// component shows the head of the queue and resolves it with Accept / Decline.

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ConnectorOpName } from '@shared/contracts'
import { bus } from '@/core/bus'

export interface PreviewField {
  /** Key into AGENT_STRINGS.fields. */
  field: 'to' | 'subject' | 'body' | 'title' | 'start' | 'end' | 'channel' | 'text'
  value: string
  /** Long text (mail body, message): rendered as a scrollable block. */
  multiline?: boolean
}

export type ConfirmCardInput =
  | { kind: 'suggestion', request: string, /** Auto-decline after this many ms. */ timeoutMs?: number }
  | { kind: 'write', op: ConnectorOpName, fields: PreviewField[] }

export interface QueuedCard { id: number, card: ConfirmCardInput }

export const useConfirmQueue = defineStore('confirm-queue', () => {
  const queue = ref<QueuedCard[]>([])
  const resolvers = new Map<number, (accepted: boolean) => void>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 1

  const current = computed<QueuedCard | null>(() => queue.value[0] ?? null)

  function requestConfirm(card: ConfirmCardInput): Promise<boolean> {
    const id = nextId++
    return new Promise<boolean>(resolve => {
      resolvers.set(id, resolve)
      queue.value.push({ id, card })
      bus.emit('character:node', { node: 'waiting' })
      if (card.kind === 'suggestion' && card.timeoutMs) {
        timers.set(id, setTimeout(() => answer(id, false), card.timeoutMs))
      }
    })
  }

  function answer(id: number, accepted: boolean): void {
    const resolve = resolvers.get(id)
    if (!resolve) return
    resolvers.delete(id)
    const t = timers.get(id)
    if (t) { clearTimeout(t); timers.delete(id) }
    queue.value = queue.value.filter(c => c.id !== id)
    resolve(accepted)
  }

  /** Declines everything still open (e.g. on teardown). */
  function declineAll(): void {
    for (const c of [...queue.value]) answer(c.id, false)
  }

  const hasSuggestion = computed(() => queue.value.some(c => c.card.kind === 'suggestion'))

  return { queue, current, hasSuggestion, requestConfirm, answer, declineAll }
})
