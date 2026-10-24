// Typed in-page event bus. Tracks talk to each other only through these events.

import type { DelegateOrigin, Emotion, MoveTarget, Transcript } from '@shared/contracts'
import type { CharacterNode, MouthPose } from './types'

export interface BusEvents {
  /** Character should show an emotion and optionally say a line (TTS if sound is on). */
  'character:react': { emotion: Emotion, line?: string, motion?: string, source: 'observer' | 'agent' | 'fallback' }
  'character:node': { node: CharacterNode }
  'character:mouth': MouthPose | null
  /** Show or hide the "..." typing bubble while a reply is being generated. */
  'thinking': { on: boolean }
  /** Speech bubble text; the character layer shows it. */
  'bubble': { text: string, ttlMs?: number } | null

  'voice:speech-start': { source: 'vad' | 'ptt' }
  'voice:speech-end': { source: 'vad' | 'ptt' }
  /** A user utterance: speech (vad/ptt) or a typed chat message (chat). Same handling path. */
  'voice:transcript': Transcript & { source: 'vad' | 'ptt' | 'chat' }
  'tts:start': { text: string }
  'tts:end': { interrupted: boolean }

  /** Observer or user asked for work. Origin decides immediate run vs confirm card. */
  'agent:delegate': { request: string, origin: DelegateOrigin, /** Localized one-liner for the suggestion card. */ summary?: string }
  'agent:busy': { busy: boolean }

  /** Move the avatar window (user asked it to step aside, come to the center, ...). */
  'assistant:move': { where: MoveTarget }

  /** Proactive interjection actually shown (counts toward the daily limit). */
  'nunchi:interjected': { at: number }
}

type Handler<T> = (payload: T) => void

class Bus {
  private handlers = new Map<keyof BusEvents, Set<Handler<any>>>()

  on<K extends keyof BusEvents>(type: K, fn: Handler<BusEvents[K]>): () => void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(fn)
    return () => set!.delete(fn)
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
    this.handlers.get(type)?.forEach(fn => {
      try { fn(payload) } catch (e) { console.error(`[bus] ${String(type)}`, e) }
    })
  }
}

export const bus = new Bus()
