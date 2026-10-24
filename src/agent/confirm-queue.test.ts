import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bus } from '@/core/bus'
import { useConfirmQueue } from './confirm-queue'

describe('confirm queue', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('shows cards in order, resolves on answer and emits waiting', async () => {
    const nodes: string[] = []
    const off = bus.on('character:node', e => nodes.push(e.node))
    const q = useConfirmQueue()
    const p1 = q.requestConfirm({ kind: 'write', op: 'mail_create_draft', fields: [] })
    const p2 = q.requestConfirm({ kind: 'suggestion', request: 'x' })
    expect(nodes).toEqual(['waiting', 'waiting'])
    expect(q.current?.card.kind).toBe('write')
    q.answer(q.current!.id, true)
    expect(q.current?.card.kind).toBe('suggestion')
    expect(q.hasSuggestion).toBe(true)
    q.answer(q.current!.id, false)
    await expect(p1).resolves.toBe(true)
    await expect(p2).resolves.toBe(false)
    expect(q.current).toBeNull()
    off()
  })

  it('auto-declines a suggestion after its timeout', async () => {
    vi.useFakeTimers()
    const q = useConfirmQueue()
    const p = q.requestConfirm({ kind: 'suggestion', request: 'x', timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    await expect(p).resolves.toBe(false)
    expect(q.queue).toHaveLength(0)
  })
})
