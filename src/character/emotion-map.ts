// App emotions (shared/contracts.ts EMOTIONS) -> each model profile's emotion labels and
// a default reaction motion. Both profiles share the labels happy, shy, sorry, troubled,
// surprised, thinking, playful, sleepy; neutral is always no expressions (both resting
// faces already smile).
//
// TT2.0 model:
//   happy     -> `happy`     blush; the mouth stays free for lip-sync.
//   thinking  -> `thinking`  pursed pout, reads as concentrating.
//   surprised -> `surprised` small round "o" mouth.
//   sorry     -> `sorry`     teary eyes + small frown.
//   focused   -> `thinking`  same concentrating pout, no reaction motion so the node
//                            motion (e.g. the working loop) keeps playing.
// Yui model:
//   happy     -> `happy`     sparkle eyes, Duchenne smile, tail wag.
//   thinking  -> `thinking`  the profile keeps the default face here on purpose; a
//                            head-tilt motion carries the emotion instead.
//   surprised -> `surprised` round comic eyes and an open "o" mouth.
//   sorry     -> `sorry`     tears, sad brows, drooping ears.
//   focused   -> `thinking`  default face, no motion (the working face).
// Mouth-drawing expressions are `hides_mouth`: the expression layer drops them while the
// mouth is active and restores them afterwards.

import type { Emotion } from '@shared/contracts'

export interface EmotionMapping {
  /** Label in the profile [emotions] table; null = no expressions. */
  label: string | null
  /** Motion played when the react event names none. */
  motion: string | null
}

export type EmotionMap = Record<Emotion, EmotionMapping>

export const TT2_EMOTIONS: EmotionMap = {
  neutral: { label: null, motion: null },
  happy: { label: 'happy', motion: '2-0-tt2-0-happyidle' },
  thinking: { label: 'thinking', motion: '2-0-tt2-0-questionmotion' },
  surprised: { label: 'surprised', motion: '2-0-tt2-0-excitingidle' },
  sorry: { label: 'sorry', motion: '2-0-tt2-0-sadmotion' },
  focused: { label: 'thinking', motion: null },
}

export const YUI_EMOTIONS: EmotionMap = {
  neutral: { label: null, motion: null },
  happy: { label: 'happy', motion: 'sekai-cute-nbglad02-face-smile' },
  thinking: { label: 'thinking', motion: 'arch-nyarchlinux-arch-thinking' },
  surprised: { label: 'surprised', motion: 'holodreams-notice-01-lv01-face-surprise' },
  sorry: { label: 'sorry', motion: 'sekai-cute-fidget01-face-shy' },
  focused: { label: 'thinking', motion: null },
}

/** CSS animation of the 2D fallback sprite per emotion. */
export const FALLBACK_ANIM: Record<Emotion, 'none' | 'bounce' | 'tilt' | 'jump' | 'droop' | 'pulse'> = {
  neutral: 'none',
  happy: 'bounce',
  thinking: 'tilt',
  surprised: 'jump',
  sorry: 'droop',
  focused: 'pulse',
}
