// Procedural layers written after motions and expressions each frame: breath, idle
// head noise, auto blink, lip sync, the speech face (pause blinks, phrase-start brow
// raises, an idle drift of mouth and brows) and the event-driven glance. The blink and lip-sync shapes are adapted from
// AIRI (MIT): a timer blink that multiplies the post-expression eye openness, and a
// mouth that eases toward the target and releases back to the motion value.

import type { CoreModel } from './core-model'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const TAU = Math.PI * 2

export function applyBreath(core: CoreModel, t: number): void {
  core.setParameterValueById('ParamBreath', 0.5 + 0.5 * Math.sin(TAU * t / 3.4))
  core.addParameterValueById('ParamBodyAngleX', 1.5 * Math.sin(TAU * t / 15.5))
}

/** Slow layered sines on the head angles, like the SDK breath effect at reduced weight. */
export function applyIdleNoise(core: CoreModel, t: number): void {
  core.addParameterValueById('ParamAngleX', 6 * Math.sin(TAU * t / 6.53))
  core.addParameterValueById('ParamAngleY', 3 * Math.sin(TAU * t / 3.53))
  core.addParameterValueById('ParamAngleZ', 4 * Math.sin(TAU * t / 5.53))
}

export class AutoBlink {
  private phase: 'idle' | 'closing' | 'opening' = 'idle'
  private progress = 0
  private delayMs = 2000
  private openMs = 200
  /** Milliseconds since the eyes were last closed, by a blink or anything else. */
  private sinceClosedMs = Infinity

  private reset() {
    this.phase = 'idle'
    this.progress = 0
    this.delayMs = 3000 + Math.random() * 5000
  }

  /**
   * Blinks now (a pause in her speech), unless she is blinking already or her eyes were
   * closed within `recentMs`: that blink already marked the pause.
   */
  force(recentMs = SPEECH_FACE.recentBlinkMs): boolean {
    if (this.phase !== 'idle' || this.sinceClosedMs < recentMs) return false
    this.phase = 'closing'
    this.progress = 0
    return true
  }

  apply(core: CoreModel, dtMs: number): void {
    const left = core.getParameterValueById('ParamEyeLOpen')
    const right = core.getParameterValueById('ParamEyeROpen')
    this.sinceClosedMs = this.phase === 'closing' || (left <= 0.15 && right <= 0.15) ? 0 : this.sinceClosedMs + dtMs
    if (this.phase === 'idle') {
      // Eyes already closed by an expression or motion: wait for the next window.
      if (left <= 0.15 && right <= 0.15) { this.reset(); return }
      this.delayMs -= dtMs
      if (this.delayMs <= 0) { this.phase = 'closing'; this.progress = 0 }
      return
    }
    let factor: number
    if (this.phase === 'closing') {
      this.progress = Math.min(1, this.progress + dtMs / 75)
      factor = 1 - (1 - (1 - this.progress) ** 2)
      if (this.progress >= 1) { this.phase = 'opening'; this.progress = 0; this.openMs = 150 + Math.random() * 150 }
    }
    else {
      this.progress = Math.min(1, this.progress + dtMs / this.openMs)
      factor = this.progress * this.progress
      if (this.progress >= 1) this.reset()
    }
    core.setParameterValueById('ParamEyeLOpen', clamp01(left * factor))
    core.setParameterValueById('ParamEyeROpen', clamp01(right * factor))
  }
}

export class LipSync {
  private current = 0
  private target: number | null = null
  private releaseMs = 0
  private static readonly RELEASE_MS = 200

  set(open: number | null): void {
    this.target = open === null ? null : clamp01(open)
  }

  get active(): boolean {
    return this.target !== null
  }

  /** The mouth openness it writes now, 0..1 (0 when not speaking). */
  get level(): number {
    return this.target === null ? 0 : this.current
  }

  apply(core: CoreModel, dtMs: number): void {
    if (this.target !== null) {
      // Ease-out toward the target: fast attack, slightly slower close.
      const tau = this.target > this.current ? 40 : 70
      this.current += (this.target - this.current) * (1 - Math.exp(-dtMs / tau))
      core.setParameterValueById('ParamMouthOpenY', this.current)
      this.releaseMs = LipSync.RELEASE_MS
      return
    }
    if (this.releaseMs <= 0) { this.current = 0; return }
    this.releaseMs = Math.max(0, this.releaseMs - dtMs)
    const s = 1 - this.releaseMs / LipSync.RELEASE_MS
    const blend = s * s * (3 - 2 * s)
    const motionValue = core.getParameterValueById('ParamMouthOpenY')
    core.setParameterValueById('ParamMouthOpenY', this.current * (1 - blend) + motionValue * blend)
  }
}

/** Makes a loaded Cubism motion repeat by itself (without a fade-in at each seam) or play once. */
export function setMotionLoop(motion: unknown, loop: boolean): void {
  if (!motion || typeof motion !== 'object') return
  const m = motion as { setIsLoop?: (v: boolean) => void, setIsLoopFadeIn?: (v: boolean) => void }
  m.setIsLoop?.(loop)
  m.setIsLoopFadeIn?.(false)
}

/**
 * How far a glance turns each part at full deflection: the eyes most (ParamEyeBallX/Y
 * units), the head moderately and the body only a few degrees. Attack and release are
 * exponential time constants in ms; the eyes lead, the head and then the body follow.
 */
export const GLANCE = {
  eye: { x: 0.85, y: 0.6 },
  head: { x: 18, y: 12 },
  body: { x: 4 },
  attackMs: { eye: 70, head: 260, body: 520 },
  releaseMs: { eye: 220, head: 480, body: 760 },
  /** She never stares longer than this, however long she keeps talking. */
  maxHoldMs: 12_000,
} as const

export interface GlanceOffsets {
  eyeX: number
  eyeY: number
  angleX: number
  angleY: number
  bodyX: number
}

/**
 * An event-driven glance: `look` turns her toward a direction for a while, then she
 * eases back to facing forward. Directions are -1..1 per axis (x right, y up).
 */
export class Glance {
  private target = { x: 0, y: 0 }
  private eye = { x: 0, y: 0 }
  private head = { x: 0, y: 0 }
  private body = 0
  private holdMs = 0
  private heldMs = 0

  look(x: number, y: number, holdMs: number): void {
    const c = (v: number) => Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0))
    this.target = { x: c(x), y: c(y) }
    this.holdMs = Math.max(0, holdMs)
    this.heldMs = 0
  }

  /** Look forward again now. */
  release(): void {
    this.holdMs = 0
  }

  get active(): boolean {
    return this.holdMs > 0 || Math.abs(this.head.x) + Math.abs(this.head.y) + Math.abs(this.eye.x) + Math.abs(this.eye.y) + Math.abs(this.body) > 4e-3
  }

  /** Advances by `dtMs`; the hold does not run down while `talking`. Null when at rest. */
  step(dtMs: number, talking: boolean): GlanceOffsets | null {
    if (this.holdMs > 0) {
      this.heldMs += dtMs
      if (!talking || this.heldMs > GLANCE.maxHoldMs) this.holdMs -= dtMs
    }
    const holding = this.holdMs > 0
    const tx = holding ? this.target.x : 0
    const ty = holding ? this.target.y : 0
    const tau = holding ? GLANCE.attackMs : GLANCE.releaseMs
    const k = (ms: number) => 1 - Math.exp(-dtMs / ms)
    this.eye.x += (tx - this.eye.x) * k(tau.eye)
    this.eye.y += (ty - this.eye.y) * k(tau.eye)
    this.head.x += (tx - this.head.x) * k(tau.head)
    this.head.y += (ty - this.head.y) * k(tau.head)
    this.body += (tx - this.body) * k(tau.body)
    if (!this.active) {
      this.eye = { x: 0, y: 0 }
      this.head = { x: 0, y: 0 }
      this.body = 0
      return null
    }
    return {
      eyeX: this.eye.x * GLANCE.eye.x,
      eyeY: this.eye.y * GLANCE.eye.y,
      angleX: this.head.x * GLANCE.head.x,
      angleY: this.head.y * GLANCE.head.y,
      bodyX: this.body * GLANCE.body.x,
    }
  }
}

/**
 * Direction of a target seen from her head, from the offset in desktop pixels (y down):
 * -1..1 per axis, x right and y up. Nearby targets turn her a little, far ones nearly fully.
 */
export function glanceDirection(dx: number, dy: number): { x: number, y: number } {
  return { x: Math.tanh(dx / 600), y: -Math.tanh(dy / 450) }
}

/**
 * The speech face's timing and sizes. A blink at a pause in her speech: the mouth quiet
 * for `pauseMs` after at least `minSpeechMs` of open-mouthed speech, at most one per
 * pause and `minPauseBlinkMs` apart, skipped when the eyes closed within `recentBlinkMs`
 * (speakers' blinks cluster at phrase ends). A brow raise of `browRaise` at the first
 * syllable after a pause (a phrase start), up in `browAttackMs` and held `browHoldMs`,
 * down in `browReleaseMs`. Off speech, a slow drift of the mouth corner (`driftMouthX`),
 * the mouth shrug (`driftShrug`, kept above 0) and the brows (`driftBrow`), gone at
 * speech start and back `driftResumeMs` after it. Openness at or below `quietOpen` is a
 * quiet mouth.
 */
export const SPEECH_FACE = {
  quietOpen: 0.1,
  pauseMs: 200,
  minSpeechMs: 300,
  minPauseBlinkMs: 1500,
  recentBlinkMs: 600,
  browRaise: 0.3,
  browAttackMs: 50,
  browHoldMs: 250,
  browReleaseMs: 100,
  driftMouthX: 0.08,
  driftShrug: 0.1,
  driftBrow: 0.03,
  driftHz: [0.11, 0.047],
  driftResumeMs: 700,
  driftFadeInMs: 1000,
  driftFadeOutMs: 50,
} as const

export interface SpeechFaceOffsets {
  /** Blink now (a pause in her speech). */
  blink: boolean
  /** Added to ParamBrowLY/RY. */
  brow: number
  /** Added to ParamMouthX. */
  mouthX: number
  /** Added to ParamMouthShrug. */
  shrug: number
}

/**
 * Small speech-driven face movements on top of the motion: a blink at pauses, a brow
 * raise at phrase starts and, while she is not talking, a slow drift of mouth and brows.
 * Fed the lip-sync openness each frame (null when no line is playing).
 */
export class SpeechFace {
  private speechMs = 0
  private quietMs = 0
  private armed = false
  private sincePauseBlinkMs = Infinity
  private browLevel = 0
  private browHoldMs = 0
  private drift = 0
  private sinceSpeechMs = Infinity
  private clock = 0
  private readonly phases: number[]

  constructor(random: () => number = Math.random) {
    this.phases = Array.from({ length: 6 }, () => random() * TAU)
  }

  step(dtMs: number, mouth: number | null): SpeechFaceOffsets {
    const dt = Math.min(Math.max(Number.isFinite(dtMs) ? dtMs : 0, 0), 100)
    const F = SPEECH_FACE
    let blink = false
    this.sincePauseBlinkMs += dt
    const speaking = mouth !== null
    const open = mouth ?? 0
    if (speaking && open > F.quietOpen) {
      // The first syllable after a pause starts a phrase: raise the brows a little.
      if (this.quietMs >= F.pauseMs || this.speechMs === 0) this.browHoldMs = F.browHoldMs
      this.speechMs += dt
      this.quietMs = 0
      if (this.speechMs >= F.minSpeechMs) this.armed = true
    }
    else {
      this.quietMs += dt
      if (this.armed && this.quietMs >= F.pauseMs) {
        this.armed = false
        if (this.sincePauseBlinkMs >= F.minPauseBlinkMs) {
          blink = true
          this.sincePauseBlinkMs = 0
        }
      }
      // A pause long enough to blink in ends the run of speech; a syllable gap does not.
      if (this.quietMs >= F.pauseMs) this.speechMs = 0
    }

    // Brow envelope: quick up, held through the syllable, a little slower down.
    const browTarget = this.browHoldMs > 0 ? 1 : 0
    this.browHoldMs = Math.max(0, this.browHoldMs - dt)
    const browMs = browTarget > this.browLevel ? F.browAttackMs : F.browReleaseMs
    this.browLevel += (browTarget - this.browLevel) * (1 - Math.exp(-dt / browMs))
    if (browTarget === 0 && this.browLevel < 1e-3) this.browLevel = 0

    // Drift: out at once when a line starts, back slowly after the lip-sync release.
    this.sinceSpeechMs = speaking ? 0 : this.sinceSpeechMs + dt
    const driftTarget = this.sinceSpeechMs >= F.driftResumeMs ? 1 : 0
    const driftMs = driftTarget > this.drift ? F.driftFadeInMs : F.driftFadeOutMs
    this.drift += (driftTarget - this.drift) * (1 - Math.exp(-dt / driftMs))
    if (driftTarget === 0 && this.drift < 1e-3) this.drift = 0
    this.clock += dt / 1000
    const noise = (channel: number) => 0.6 * Math.sin(TAU * F.driftHz[0] * this.clock + this.phases[channel * 2]!)
      + 0.4 * Math.sin(TAU * F.driftHz[1] * this.clock + this.phases[channel * 2 + 1]!)

    return {
      blink,
      brow: this.browLevel * F.browRaise + this.drift * F.driftBrow * noise(2),
      mouthX: this.drift * F.driftMouthX * noise(0),
      shrug: this.drift * F.driftShrug * (noise(1) + 1) / 2,
    }
  }
}
