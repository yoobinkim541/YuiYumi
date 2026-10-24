// Procedural layers written after motions and expressions each frame: breath, idle
// head noise, auto blink, lip sync and the event-driven glance. The blink and lip-sync shapes are adapted from
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

  private reset() {
    this.phase = 'idle'
    this.progress = 0
    this.delayMs = 3000 + Math.random() * 5000
  }

  apply(core: CoreModel, dtMs: number): void {
    const left = core.getParameterValueById('ParamEyeLOpen')
    const right = core.getParameterValueById('ParamEyeROpen')
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
