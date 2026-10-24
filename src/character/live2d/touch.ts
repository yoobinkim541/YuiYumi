// Classifies presses on the avatar into reactions: a petting session, a tap on the head
// or body, or repeated poking. Pure; times are milliseconds from one clock and points
// client pixels.

export type TouchRegion = 'head' | 'body'

export type TouchReaction =
  | { kind: 'pet', ms: number }
  | { kind: 'tap', region: TouchRegion }
  | { kind: 'pout' }

export interface TouchOptions {
  /** A press released within this time and distance is a tap. */
  tapMaxMs: number
  tapMaxMovePx: number
  /** This many taps within the window count as poking. */
  pokeCount: number
  pokeWindowMs: number
  /** Petting shorter than this does not count as a petting session. */
  petMinMs: number
}

export const TOUCH_DEFAULTS: TouchOptions = {
  tapMaxMs: 350,
  tapMaxMovePx: 10,
  pokeCount: 3,
  pokeWindowMs: 2500,
  petMinMs: 500,
}

export class TouchGestures {
  private press: { region: TouchRegion, x: number, y: number, t: number, moved: number } | null = null
  private petSince: number | null = null
  private pettedMs = 0
  private taps: number[] = []

  constructor(private readonly opts: TouchOptions = TOUCH_DEFAULTS) {}

  get pressing(): TouchRegion | null {
    return this.press?.region ?? null
  }

  down(region: TouchRegion, x: number, y: number, t: number): void {
    this.press = { region, x, y, t, moved: 0 }
    this.petSince = null
    this.pettedMs = 0
  }

  move(x: number, y: number): void {
    if (!this.press) return
    this.press.moved = Math.max(this.press.moved, Math.hypot(x - this.press.x, y - this.press.y))
  }

  /** The head-pat detector started or stopped seeing petting. */
  petting(on: boolean, t: number): void {
    if (on && this.petSince === null) this.petSince = t
    else if (!on && this.petSince !== null) {
      this.pettedMs += t - this.petSince
      this.petSince = null
    }
  }

  /** Ends the press; returns the reaction it earned, if any. */
  up(t: number): TouchReaction | null {
    const p = this.press
    if (!p) return null
    this.petting(false, t)
    this.press = null
    if (this.pettedMs >= this.opts.petMinMs) {
      this.taps = []
      return { kind: 'pet', ms: this.pettedMs }
    }
    if (t - p.t > this.opts.tapMaxMs || p.moved > this.opts.tapMaxMovePx) return null
    this.taps = this.taps.filter(at => t - at <= this.opts.pokeWindowMs)
    this.taps.push(t)
    if (this.taps.length >= this.opts.pokeCount) {
      this.taps = []
      return { kind: 'pout' }
    }
    return { kind: 'tap', region: p.region }
  }

  cancel(): void {
    this.press = null
    this.petSince = null
    this.pettedMs = 0
  }
}

/** Whether a point lies inside a triangle (either winding). */
export function pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
