// Prepared lines used when the observer API fails or the budget cap is reached (AC-8).
// Only used in reply to an utterance, and rate-limited by the caller.
// The lines are the built-in 'offline' lines of the active character, so they play from
// pre-generated clips even when live TTS is down too (src/voice/builtin-lines.ts).

import type { Emotion } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { DEFAULT_CHARACTER, type CharacterId } from '@/character/models'
import { CATEGORY_INFO, linesFor } from '@/voice/builtin-lines'

export interface FallbackLine { emotion: Emotion, line: string }

export const FALLBACK_MIN_INTERVAL_MS = 30_000

let characterOf: () => CharacterId = () => DEFAULT_CHARACTER

/** Tells the fallback lines which character is speaking (set once by the voice module). */
export function setFallbackCharacter(fn: () => CharacterId): void {
  characterOf = fn
}

export function pickFallback(lang: Lang, seq: number): FallbackLine {
  const character = characterOf()
  let list = linesFor(character, lang, 'offline')
  if (!list.length) list = linesFor(character, 'en', 'offline')
  return { emotion: CATEGORY_INFO.offline.emotion ?? 'sorry', line: list[seq % list.length]!.display }
}
