// Track D entry: wires agent:delegate on the bus to the agent loop.

import type { DelegateOrigin } from '@shared/contracts'
import { bus } from '@/core/bus'
import { runConnector } from '@/connectors/registry'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { createStepClient, handleDelegate, type AgentDeps } from './agent-loop'
import { useConfirmQueue } from './confirm-queue'

let initialized = false

export function initAgent(): void {
  if (initialized) return
  initialized = true

  const settings = useSettings()
  const demo = useDemo()
  const confirmQueue = useConfirmQueue()
  const persona = usePersona()

  const deps: AgentDeps = {
    step: createStepClient(),
    runTool: (name, input) => runConnector(name, input, { demo, sessionId: settings.sessionId }),
    confirm: card => confirmQueue.requestConfirm(card),
    emit: (type, payload) => bus.emit(type, payload),
    lang: () => settings.lang,
    sessionId: settings.sessionId,
    persona: () => persona.activePersona,
    channelName: id => demo.slackChannels.find(c => c.id === id)?.name,
  }

  let busy = false
  let chain: Promise<unknown> = Promise.resolve()

  bus.on('agent:delegate', payload => {
    const request = payload.request.trim()
    if (!request) return
    if (payload.origin === 'screen') {
      // A proactive offer never interrupts running work or stacks on another offer.
      if (busy || confirmQueue.hasSuggestion) return
    } else {
      // The user spoke: an open proactive offer is moot.
      for (const c of confirmQueue.queue) if (c.card.kind === 'suggestion') confirmQueue.answer(c.id, false)
    }
    chain = chain
      .then(() => handleDelegate({ request, origin: payload.origin }, deps))
      .catch(e => console.error('[agent]', e))
  })
  bus.on('agent:busy', ({ busy: b }) => { busy = b })

  // Dev-only console hook for manual testing: __yuiDelegate('...', 'screen')
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__yuiDelegate =
      (request: string, origin: DelegateOrigin = 'utterance') => bus.emit('agent:delegate', { request, origin })
  }
}

export { useConfirmQueue } from './confirm-queue'
