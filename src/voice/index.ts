// Track C: voice input (push-to-talk, optional VAD, STT) and output (TTS, lip sync,
// barge-in). Talks to other tracks only through the bus.

import { bus } from '@/core/bus'
import { useSettings } from '@/stores/settings'
import { installBargeIn } from './barge-in'
import { SpeechPlayer } from './player'
import { installPtt, pttDown, pttUp } from './ptt'
import { voiceState } from './state'
import type { SttContext } from './stt-client'
import { configureVad, setVadEnabled } from './vad'
import { useCharacterStore } from '@/character/store'

export { currentStatus, voiceState, type VoiceStatus } from './state'
export { pttDown, pttUp, setVadEnabled }

let initialised = false
let player: SpeechPlayer | null = null

/** Unlocks audio playback; ControlBar calls it on interaction, PTT/key presses do too. */
export function unlockAudio(): void {
  player?.unlock()
}

export function initVoice(): void {
  if (initialised) return
  initialised = true
  const settings = useSettings()
  const sttCtx = (): SttContext => ({ lang: settings.lang, sessionId: settings.sessionId })

  player = new SpeechPlayer()
  const p = player

  installPtt(sttCtx)
  configureVad(sttCtx, () => voiceState.recording)
  installBargeIn(p)

  // Browsers only allow audio after a user gesture: unlock on the first one.
  const unlock = () => {
    p.unlock()
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)

  bus.on('character:react', ({ line, emotion }) => {
    const text = line?.trim()
    if (!text || !settings.sound) return
    void p.say({ text: text.slice(0, 500), lang: settings.lang, emotion, character: useCharacterStore().character, sessionId: settings.sessionId })
  })

  // Turning sound off silences the current line immediately.
  settings.$subscribe((_m, state) => {
    if (!state.sound) p.stop({ interrupted: true, fadeMs: 100, node: 'idle' })
  })
}
