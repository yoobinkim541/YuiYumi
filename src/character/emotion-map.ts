// App emotions (shared/contracts.ts EMOTIONS) -> each model's faces and a pool of
// reaction motions (choreography.ts; one is picked at random per reaction). A face is a
// profile emotion label (both profiles share happy, shy, sorry, troubled, surprised,
// thinking, playful, sleepy) or, where no label fits, an exp3 expression name used
// directly. neutral is always no expressions (both resting faces already smile).
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
// focused carries none either, so the node motion (the working loop) keeps playing.
// Mouth-drawing expressions are `hides_mouth`: the expression layer drops them while the
// mouth is active and restores them afterwards.

import type { Emotion } from '@shared/contracts'
import { TT2_CHOREOGRAPHY, YUI_CHOREOGRAPHY } from './choreography'

export interface EmotionMapping {
  /** Profile [emotions] labels or exp3 expression names; empty = no expressions. */
  faces: readonly string[]
  /** Reaction motions, one picked at random when the react event names none; empty = none. */
  motions: readonly string[]
}

export type EmotionMap = Record<Emotion, EmotionMapping>

export const TT2_EMOTIONS: EmotionMap = {
  neutral: { faces: [], motions: TT2_CHOREOGRAPHY.emotions.neutral },
  happy: { faces: ['happy'], motions: TT2_CHOREOGRAPHY.emotions.happy },
  thinking: { faces: ['thinking'], motions: TT2_CHOREOGRAPHY.emotions.thinking },
  surprised: { faces: ['surprised'], motions: TT2_CHOREOGRAPHY.emotions.surprised },
  sorry: { faces: ['sorry'], motions: TT2_CHOREOGRAPHY.emotions.sorry },
  focused: { faces: ['thinking'], motions: TT2_CHOREOGRAPHY.emotions.focused },
  curious: { faces: ['脸红', '震惊嘴'], motions: TT2_CHOREOGRAPHY.emotions.curious },
}

export const YUI_EMOTIONS: EmotionMap = {
  neutral: { faces: [], motions: YUI_CHOREOGRAPHY.emotions.neutral },
  happy: { faces: ['happy'], motions: YUI_CHOREOGRAPHY.emotions.happy },
  thinking: { faces: ['thinking'], motions: YUI_CHOREOGRAPHY.emotions.thinking },
  surprised: { faces: ['surprised'], motions: YUI_CHOREOGRAPHY.emotions.surprised },
  sorry: { faces: ['sorry'], motions: YUI_CHOREOGRAPHY.emotions.sorry },
  focused: { faces: ['thinking'], motions: YUI_CHOREOGRAPHY.emotions.focused },
  curious: { faces: ['고양이눈', '반짝이펙트', '꼬리흔들기'], motions: YUI_CHOREOGRAPHY.emotions.curious },
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
