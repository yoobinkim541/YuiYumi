// App emotions (shared/contracts.ts EMOTIONS) -> each model's faces and a default
// reaction motion. A face is a profile emotion label (both profiles share happy, shy,
// sorry, troubled, surprised, thinking, playful, sleepy) or, where no label fits, an exp3
// expression name used directly. neutral is always no expressions (both resting faces
// already smile).
//
// TT2.0 model:
//   happy     -> `happy`     blush; the mouth stays free for lip-sync.
//   thinking  -> `thinking`  pursed pout, reads as concentrating.
//   surprised -> `surprised` small round "o" mouth.
//   sorry     -> `sorry`     teary eyes + small frown.
//   focused   -> `thinking`  same concentrating pout, no reaction motion so the node
//                            motion (e.g. the working loop) keeps playing.
//   curious   -> 脸红 + 震惊嘴  blush and the small "o?" mouth: "oh, what's that?". The
//                            blank 震惊 comic eyes stay reserved for the fast head rub.
// Yui model:
//   happy     -> `happy`     sparkle eyes, Duchenne smile, tail wag.
//   thinking  -> `thinking`  the profile keeps the default face here on purpose; a
//                            head-tilt motion carries the emotion instead.
//   surprised -> `surprised` round comic eyes and an open "o" mouth.
//   sorry     -> `sorry`     tears, sad brows, drooping ears.
//   focused   -> `thinking`  default face, no motion (the working face).
//   curious   -> 고양이눈 + 반짝이펙트 + 꼬리흔들기  white comic cat eyes with sparkles
//                            around her head and a tail wag: "ooh, interesting!"
// curious carries no reaction motion on either model: it comes with a glance toward the
// screen activity (character:look), and a head-turning motion would fight that glance.
// Mouth-drawing expressions are `hides_mouth`: the expression layer drops them while the
// mouth is active and restores them afterwards.

import type { Emotion } from '@shared/contracts'

export interface EmotionMapping {
  /** Profile [emotions] labels or exp3 expression names; empty = no expressions. */
  faces: readonly string[]
  /** Motion played when the react event names none. */
  motion: string | null
}

export type EmotionMap = Record<Emotion, EmotionMapping>

export const TT2_EMOTIONS: EmotionMap = {
  neutral: { faces: [], motion: null },
  happy: { faces: ['happy'], motion: '2-0-tt2-0-happyidle' },
  thinking: { faces: ['thinking'], motion: '2-0-tt2-0-questionmotion' },
  surprised: { faces: ['surprised'], motion: '2-0-tt2-0-excitingidle' },
  sorry: { faces: ['sorry'], motion: '2-0-tt2-0-sadmotion' },
  focused: { faces: ['thinking'], motion: null },
  curious: { faces: ['脸红', '震惊嘴'], motion: null },
}

export const YUI_EMOTIONS: EmotionMap = {
  neutral: { faces: [], motion: null },
  happy: { faces: ['happy'], motion: 'sekai-cute-nbglad02-face-smile' },
  thinking: { faces: ['thinking'], motion: 'arch-nyarchlinux-arch-thinking' },
  surprised: { faces: ['surprised'], motion: 'holodreams-notice-01-lv01-face-surprise' },
  sorry: { faces: ['sorry'], motion: 'sekai-cute-fidget01-face-shy' },
  focused: { faces: ['thinking'], motion: null },
  curious: { faces: ['고양이눈', '반짝이펙트', '꼬리흔들기'], motion: null },
}

/** CSS animation of the 2D fallback sprite per emotion. */
export const FALLBACK_ANIM: Record<Emotion, 'none' | 'bounce' | 'tilt' | 'jump' | 'droop' | 'pulse'> = {
  neutral: 'none',
  happy: 'bounce',
  thinking: 'tilt',
  surprised: 'jump',
  sorry: 'droop',
  focused: 'pulse',
  curious: 'tilt',
}
