// Track D entry: wires agent:delegate on the bus to the agent loop.

import type { DelegateOrigin } from '@shared/contracts'
import { bus } from '@/core/bus'
import { runConnector } from '@/connectors/registry'
import { desktopActuator, resetStage } from '@/desktop/actuator'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { useCharacterStore } from '@/character/store'
import { observerSpokeRecently, pickBuiltin, playBuiltin } from '@/voice'
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
  const character = useCharacterStore()
  const prepared = { done: 'done', incomplete: 'incomplete', offline: 'agentOffline' } as const
  /** The running task had a card declined: no cheerful "done!" before its result. */
  let declined = false

  const deps: AgentDeps = {
    step: createStepClient(),
    runTool: (name, input) => runConnector(name, input, { demo, sessionId: settings.sessionId }),
    confirm: (card) => {
      // Asks out loud too: the card alone is easy to miss.
      if (card.kind === 'write') playBuiltin(card.grade === 'outbound' ? 'confirmSend' : 'confirm')
      return confirmQueue.requestConfirm(card).then((ok) => {
        if (!ok && card.kind === 'write') declined = true
        return ok
      })
    },
    emit: (type, payload) => bus.emit(type, payload),
    lang: () => settings.speechLang,
    sessionId: settings.sessionId,
    persona: () => persona.activePersona,
    channelName: id => (demo.slackChannels.find(c => c.id === id) ?? demo.discordChannels.find(c => c.id === id))?.name,
    preview: {
      mail: id => demo.mails.find(m => m.id === id),
      draft: id => demo.drafts.find(d => d.id === id),
      event: id => demo.events.find(e => e.id === id),
    },
    permission: () => settings.permission,
    actuator: desktopActuator,
    // An accepted suggestion is acknowledged when it starts (a spoken request already was).
    onStart: (origin) => {
      declined = false
      if (origin === 'screen') playBuiltin('ack')
    },
    // A short "done!" clip covers the TTS latency of the result line, which follows it.
    onResult: (result) => { if (result.ok && result.text && !declined) playBuiltin('done', { emotion: null, bubble: false }) },
    preparedLine: kind => pickBuiltin(prepared[kind], character.character, settings.speechLang)?.display,
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
      // Acknowledge at once, hiding the agent's latency, unless the observer already did.
      if (!observerSpokeRecently()) playBuiltin('ack')
    }
    chain = chain
      .then(() => handleDelegate({ request, origin: payload.origin, summary: payload.summary }, deps))
      .catch(e => console.error('[agent]', e))
      .finally(resetStage)
  })
  bus.on('agent:busy', ({ busy: b }) => { busy = b })

  // Dev-only console hook for manual testing: __yuiDelegate('...', 'screen')
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__yuiDelegate =
      (request: string, origin: DelegateOrigin = 'utterance') => bus.emit('agent:delegate', { request, origin })
    ;(window as unknown as Record<string, unknown>).__yuiBus = bus
  }
}

export { useConfirmQueue } from './confirm-queue'
