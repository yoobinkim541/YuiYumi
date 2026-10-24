// Barge-in: when the user starts speaking, stop the character mid-line and cancel any
// pending TTS fetch so it does not start talking over the user.

import { bus } from '@/core/bus'
import type { SpeechPlayer } from './player'

export const BARGE_IN_FADE_MS = 100

export function installBargeIn(player: SpeechPlayer): () => void {
  return bus.on('voice:speech-start', () => {
    player.stop({ interrupted: true, fadeMs: BARGE_IN_FADE_MS, node: 'listening' })
  })
}
