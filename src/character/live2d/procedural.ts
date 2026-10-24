// Procedural layers written after motions and expressions each frame: breath, idle
// head noise, auto blink and lip sync. The blink and lip-sync shapes are adapted from
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
