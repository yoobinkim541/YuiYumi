import { watch } from 'vue'
import { bus } from '@/core/bus'
import { getScreenSource } from '@/host'
import { useSettings } from '@/stores/settings'
import { postObserve } from './observer-client'
import { NunchiEngine } from './scheduler'

export { nunchiStatus } from './scheduler'

let engine: NunchiEngine | null = null

export function initNunchi(): void {
  if (engine) return
  const settings = useSettings()
  engine = new NunchiEngine({
    source: getScreenSource,
    post: postObserve,
    emit: (type, payload) => bus.emit(type, payload),
    settings: {
      get mode() { return settings.mode },
      get lang() { return settings.lang },
      get sessionId() { return settings.sessionId },
      setMode: m => { settings.mode = m },
    },
    storage: localStorage,
    visible: () => document.visibilityState === 'visible',
  })
  const e = engine

  bus.on('agent:busy', ({ busy }) => e.setAgentBusy(busy))
  bus.on('voice:speech-start', () => e.setSpeaking(true))
  bus.on('voice:speech-end', () => e.setSpeaking(false))
  bus.on('voice:transcript', t => {
    e.setSpeaking(false)
    void e.onTranscript(t.text, t.lang)
  })
  bus.on('character:react', r => { if (r.line) e.onAssistantLine(r.line) })

  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') e.pause() })
  watch(() => settings.mode, m => { if (m !== 'active') e.pause() })

  e.start()
}
