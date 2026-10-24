// Reaction motions per model: which one-shot motions answer an emotion, a touch and a
// quiet idle stretch. Each slot is a pool; one motion is picked at random, never the same
// one twice in a row, so repeated reactions do not look canned.
//
// Plain data with no runtime imports: scripts/build-web-model.mjs imports this file too,
// so every motion named here is packed into the model.
//
// Yui (models/Yui/motions): quality-screened one-shots with their labels.
//   happy     sekai-cute-nbglad02-face-smile  nods along with a smile
//             eye-smile-beam                  closed-eye fang beam
//             eye-smile-giggle                crescent-eyed giggle, shoulders bobbing
//             sekai-special01-amusing         sways her body, head thrown back, amused
//             sekai-dayo-joy01                head up, bobbing side to side
//             sekai-adult-glad01              a big happy body sway (the bounce)
//   thinking  arch-nyarchlinux-arch-thinking  tilts her head, eyes up to the side
//             jp-shinshin86-thinking          tilts her head, glancing up to the side
//             sekai-special13-lookuptilthead  looks up and tilts her head
//             holodreams-question-01-lv03     head up, tilting, looking up
//             sekai-cute-tilthead0302         leans and tilts her head deep
//   surprised holodreams-notice-01-lv01-face-surprise  perks up, startled
//             sekai-pure12-surprise           jumps back, head snapping up
//   sorry     sekai-cute-fidget01-face-shy    head down, eyes shut, an awkward wriggle
//             sekai-happy-sad01               head up, then drooping right down
//             sekai-cool-sad01                eyes closed, head dropping
//   touch     tapHead: eye-smile-soft, creamsoda winks; poke: a huff (sekai-happy-angry01)
//             and a head shake (jp-shinshin86-shakehead); petted: soft eye smile, a
//             swaying head, a giggle.
//   idle      a quick tongue flick, winks, a soft eye smile, a slow sway.
// No squeezed-shut eyes and nothing that follows the cursor. `focused` and `curious`
// play no motion: focused keeps the working loop, curious comes with a glance at the
// screen (character:look) that a head-turning motion would fight.
//
// Yumi (TT2.0) keeps her own 15 s TT2 motions as the first choice of each emotion and
// borrows the same standard-parameter one-shots from Yui's set (head, body, eye-open,
// eye-smile and eyeball curves only; the TT2 rig has every one of those parameters).
// The face-added Yui variants and the tongue licks (Yui's tongue parameter) stay Yui's.

export type MotionPool = readonly string[]

export type ChoreographyEmotion = 'neutral' | 'happy' | 'thinking' | 'surprised' | 'sorry' | 'focused' | 'curious'

export interface Choreography {
  /** Reaction motions per app emotion; empty plays none. */
  emotions: Record<ChoreographyEmotion, MotionPool>
  touch: {
    /** A tap on her head (she is pleased). */
    tapHead: MotionPool
    /** A tap on her body (she is startled). */
    tapBody: MotionPool
    /** Poked repeatedly: a pouty huff. */
    poke: MotionPool
    /** After a petting session. */
    petted: MotionPool
  }
  /** Now and then while idle, calm and untouched, one of these plays. */
  idle: { motions: MotionPool, everyMs: readonly [number, number] }
  /** A loop she talks over while a line plays, for a model without an animation graph. */
  speakingLoop: string | null
}

const YUI_HAPPY = [
  'sekai-cute-nbglad02-face-smile',
  'eye-smile-beam',
  'eye-smile-giggle',
  'sekai-special01-amusing',
  'sekai-dayo-joy01',
  'sekai-adult-glad01',
] as const
const YUI_SURPRISED = ['holodreams-notice-01-lv01-face-surprise', 'sekai-pure12-surprise'] as const

export const YUI_CHOREOGRAPHY: Choreography = {
  emotions: {
    neutral: [],
    happy: YUI_HAPPY,
    thinking: [
      'arch-nyarchlinux-arch-thinking',
      'jp-shinshin86-thinking',
      'sekai-special13-lookuptilthead',
      'holodreams-question-01-lv03',
      'sekai-cute-tilthead0302',
    ],
    surprised: YUI_SURPRISED,
    sorry: ['sekai-cute-fidget01-face-shy', 'sekai-happy-sad01', 'sekai-cool-sad01'],
    focused: [],
    curious: [],
  },
  touch: {
    tapHead: ['eye-smile-soft', 'creamsoda-wink-left', 'creamsoda-wink-right', 'sekai-cute-nbglad02-face-smile'],
    tapBody: YUI_SURPRISED,
    poke: ['sekai-happy-angry01', 'jp-shinshin86-shakehead'],
    petted: ['eye-smile-soft', 'sekai-cute-nbshy02', 'eye-smile-giggle'],
  },
  idle: {
    motions: ['tongue-lick-quick', 'creamsoda-wink-left', 'creamsoda-wink-right', 'eye-smile-soft', 'sekai-normal-yurayura01'],
    everyMs: [35_000, 75_000],
  },
  // The animation graph gives Yui's speaking node its own talking loop.
  speakingLoop: null,
}

const TT2_SURPRISED = ['2-0-tt2-0-excitingidle', 'sekai-pure12-surprise'] as const

export const TT2_CHOREOGRAPHY: Choreography = {
  emotions: {
    neutral: [],
    happy: ['2-0-tt2-0-happyidle', 'eye-smile-beam', 'eye-smile-giggle', 'sekai-cute-nbglad02', 'sekai-special01-amusing', 'sekai-adult-glad01'],
    thinking: ['2-0-tt2-0-questionmotion', 'jp-shinshin86-thinking', 'sekai-special13-lookuptilthead', 'holodreams-question-01-lv03'],
    surprised: TT2_SURPRISED,
    sorry: ['2-0-tt2-0-sadmotion', 'sekai-cute-fidget01', 'sekai-happy-sad01'],
    focused: [],
    curious: [],
  },
  touch: {
    tapHead: ['eye-smile-soft', 'creamsoda-wink-left', 'creamsoda-wink-right', 'sekai-cute-nbglad02'],
    tapBody: TT2_SURPRISED,
    poke: ['sekai-happy-angry01', 'jp-shinshin86-shakehead'],
    petted: ['eye-smile-soft', 'sekai-cute-nbshy02', 'eye-smile-giggle'],
  },
  idle: {
    motions: ['creamsoda-wink-left', 'creamsoda-wink-right', 'eye-smile-soft', 'sekai-normal-yurayura01'],
    everyMs: [35_000, 75_000],
  },
  // Nods and tilts with a smile while she talks (shared with Yui's speaking node).
  speakingLoop: 'community-4304-john-sensei-haru-g-m09-d25465',
}

export const CHOREOGRAPHY = { yui: YUI_CHOREOGRAPHY, tt2: TT2_CHOREOGRAPHY } as const

/** Every motion a choreography names, once each. */
export function choreographyMotions(c: Choreography): string[] {
  const all = [
    ...Object.values(c.emotions).flat(),
    ...Object.values(c.touch).flat(),
    ...c.idle.motions,
    ...(c.speakingLoop ? [c.speakingLoop] : []),
  ]
  return [...new Set(all)]
}

/**
 * Picks motions from pools at random, never the same one twice in a row for one key
 * (an emotion, a touch kind), and only among the motions `available` says the model has.
 */
export class MotionPicker {
  private last = new Map<string, string>()
  private readonly random: () => number

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  pick(key: string, pool: MotionPool, available: (name: string) => boolean = () => true): string | null {
    const choices = pool.filter(available)
    if (choices.length === 0) return null
    const previous = this.last.get(key)
    const fresh = choices.length > 1 ? choices.filter(name => name !== previous) : choices
    const name = fresh[Math.min(fresh.length - 1, Math.floor(this.random() * fresh.length))]!
    this.last.set(key, name)
    return name
  }
}
