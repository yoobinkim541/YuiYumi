import { watch } from 'vue'
import { bus } from '@/core/bus'
import { getScreenSource } from '@/host'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { postObserve } from './observer-client'
import { NunchiEngine, type LookTarget } from './scheduler'

export { nunchiStatus } from './scheduler'

let engine: NunchiEngine | null = null

/** Recent dialogue turns (read-only copy) for the dashboard. */
export function recentDialogue() {
  return engine?.dialogue.recent() ?? []
}

export function initNunchi(): void {
  if (engine) return
  const settings = useSettings()
  const persona = usePersona()
  engine = new NunchiEngine({
    source: getScreenSource,
    // The active character card rides along with every observe request.
    post: (req, signal) => postObserve({ ...req, persona: persona.activePersona }, signal),
    emit: (type, payload) => bus.emit(type, payload),
    settings: {
      // No screen watching until the first-visit welcome is done.
      get mode() { return settings.welcomed ? settings.mode : 'ornamental' },
      get lang() { return settings.speechLang },
      get sessionId() { return settings.sessionId },
      setMode: m => { settings.mode = m },
    },
    visible: () => document.visibilityState === 'visible',
    // Sources that can tell where the user is acting (the virtual desktop can) expose lookTarget().
    lookTarget: () => (getScreenSource() as { lookTarget?: () => LookTarget | null }).lookTarget?.() ?? null,
  })
  const e = engine

  bus.on('agent:busy', ({ busy }) => e.setAgentBusy(busy))
  bus.on('voice:speech-start', () => e.setSpeaking(true))
  bus.on('voice:speech-end', () => e.setSpeaking(false))
  bus.on('tts:start', () => e.setTtsPlaying(true))
  bus.on('tts:end', () => e.setTtsPlaying(false))
  bus.on('voice:transcript', t => {
    e.setSpeaking(false)
    void e.onTranscript(t.text, t.lang)
  })
  bus.on('character:react', r => { if (r.line) e.onAssistantLine(r.line) })

  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') e.pause() })
  watch(() => settings.mode, m => { if (m !== 'active') e.pause() })

  e.start()
}
