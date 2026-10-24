// A hand on her head: pressing on it grabs that point, dragging pulls her head (and her
// body after it) toward the hand on damped springs, and a fast back-and-forth counts as
// petting. Adapted from AIRI (MIT).
//
// Everything here is pure: points are client coordinates (y down), times milliseconds
// from one clock, and `step` returns angles in degrees that the frame hook adds on top
// of the motion (ParamAngleX/Y/Z for the head, ParamBodyAngleX/Z for the body).

export interface Point2 {
  x: number
  y: number
}

/** Her head in client coordinates: the eye center and the head radius in pixels. */
export interface HeadPatHead {
  x: number
  y: number
  radius: number
}

export interface HeadPatPose {
  x: number
  y: number
  z: number
  bodyX: number
  bodyZ: number
}

export interface HeadPatState {
  /** A press on her head is held. */
  holding: boolean
  /** The held hand moves fast enough to count as petting. */
  petting: boolean
}

export interface SpringAxis {
  position: number
  velocity: number
}

/**
 * The pressable head, in head radii around the eyes: an ellipse from the ear tips and
 * the top of the hair down to just below the eyes. Cheeks and chin are left out.
 */
export const HEAD_PAT_ZONE = { centerAbove: 0.9, halfWidth: 1.15, halfHeight: 1.35 } as const
/** The neck the head turns about, in head radii below the eyes. */
export const HEAD_PAT_PIVOT_BELOW = 1
export const HEAD_PAT_TURN_DEGREES = 26
export const HEAD_PAT_NOD_DEGREES = 22
export const HEAD_PAT_TILT_DEGREES = 26
export const HEAD_PAT_PULL_GAIN = 1.3
export const HEAD_PAT_LEVER_GAIN = 0.7
/** Quick (about 0.2 s to follow the hand) and a little loose, so the head swings past a turn. */
export const HEAD_PAT_HOLD_SPRING = { omega: 22, damping: 0.55 } as const
/** After a release the head bounces back to rest. */
export const HEAD_PAT_RELEASE_SPRING = { omega: 9, damping: 0.6 } as const
/** The body turns and tilts this share of the way the head does. */
export const HEAD_PAT_BODY_SHARE = { x: 0.4, z: 0.35 } as const
/** The body trails the head and swings on a little longer, which sets hair and skirt swaying. */
export const HEAD_PAT_BODY_SPRING = { omega: 11, damping: 0.45 } as const
/**
 * Hand speed in head radii per second, smoothed over SPEED_SECONDS: petting starts above
 * PETTING_SPEED and ends once the speed stays below CALM_SPEED for CALM_SECONDS.
 */
export const HEAD_PAT_SPEED_SECONDS = 0.25
export const HEAD_PAT_PETTING_SPEED = 3
export const HEAD_PAT_CALM_SPEED = 1.2
export const HEAD_PAT_CALM_SECONDS = 0.5

const stillAfterSeconds = 0.05
const restingDegrees = 0.01
const springStepSeconds = 1 / 480

/** Advances a damped spring toward `target` (damping ratio below 1 swings past it). */
export function stepSpring(axis: SpringAxis, target: number, spring: { omega: number, damping: number }, seconds: number): void {
  const steps = Math.max(1, Math.ceil(seconds / springStepSeconds))
  const h = seconds / steps
  for (let i = 0; i < steps; i++) {
    axis.velocity += (-2 * spring.damping * spring.omega * axis.velocity - spring.omega * spring.omega * (axis.position - target)) * h
    axis.position += axis.velocity * h
  }
}

/** Whether `point` lies on her head. */
export function headPatZoneContains(head: HeadPatHead, point: Point2): boolean {
  if (!(head.radius > 0)) return false
  const dx = (point.x - head.x) / (head.radius * HEAD_PAT_ZONE.halfWidth)
  const dy = (point.y - (head.y - head.radius * HEAD_PAT_ZONE.centerAbove)) / (head.radius * HEAD_PAT_ZONE.halfHeight)
  return dx * dx + dy * dy <= 1
}

/**
 * The head pose a hand holding a point of her head pulls her into. A sideways pull turns
 * the head toward it, an up or down pull nods it, and pulling the grabbed point around
 * the neck tilts it. Each angle eases off toward its limit.
 */
export function headPatPose(head: HeadPatHead, start: Point2, pointer: Point2): Pick<HeadPatPose, 'x' | 'y' | 'z'> {
  const pullX = (pointer.x - start.x) / head.radius
  const pullY = (pointer.y - start.y) / head.radius
  const leverX = (start.x - head.x) / head.radius
  const leverY = (start.y - (head.y + head.radius * HEAD_PAT_PIVOT_BELOW)) / head.radius
  // Screen y points down, so a positive cross product turns the grabbed point clockwise
  // on screen, which ParamAngleZ > 0 does to her head.
  const torque = leverX * pullY - leverY * pullX
  return {
    x: HEAD_PAT_TURN_DEGREES * Math.tanh(pullX * HEAD_PAT_PULL_GAIN),
    y: HEAD_PAT_NOD_DEGREES * Math.tanh(-pullY * HEAD_PAT_PULL_GAIN),
    z: HEAD_PAT_TILT_DEGREES * Math.tanh(torque * HEAD_PAT_LEVER_GAIN),
  }
}

export function createHeadPat(options: { onChange?: (state: HeadPatState) => void } = {}) {
  let grab: { head: HeadPatHead, start: Point2, pointer: Point2, movedAt: number } | null = null
  let speed = 0
  let calmSeconds = 0
  let stillSeconds = 0
  const state: HeadPatState = { holding: false, petting: false }
  const axes: Record<'x' | 'y' | 'z', SpringAxis> = {
    x: { position: 0, velocity: 0 },
    y: { position: 0, velocity: 0 },
    z: { position: 0, velocity: 0 },
  }
  const body: Record<'x' | 'z', SpringAxis> = {
    x: { position: 0, velocity: 0 },
    z: { position: 0, velocity: 0 },
  }
  const springs = [...Object.values(axes), ...Object.values(body)]

  function update(next: HeadPatState) {
    if (next.holding === state.holding && next.petting === state.petting) return
    state.holding = next.holding
    state.petting = next.petting
    options.onChange?.({ ...state })
  }

  return {
    get state(): Readonly<HeadPatState> {
      return state
    },

    /** Grabs her head at `point` if it lies on it; returns whether it did. */
    press(point: Point2, head: HeadPatHead, nowMs: number): boolean {
      if (!headPatZoneContains(head, point)) return false
      grab = { head, start: { ...point }, pointer: { ...point }, movedAt: nowMs }
      speed = 0
      calmSeconds = 0
      update({ holding: true, petting: false })
      return true
    },

    move(point: Point2, nowMs: number): void {
      if (!grab) return
      const seconds = (nowMs - grab.movedAt) / 1000
      if (seconds <= 0) { grab.pointer = { ...point }; return }
      const radii = Math.hypot(point.x - grab.pointer.x, point.y - grab.pointer.y) / grab.head.radius
      speed += (radii / seconds - speed) * (1 - Math.exp(-seconds / HEAD_PAT_SPEED_SECONDS))
      grab.pointer = { ...point }
      grab.movedAt = nowMs
      stillSeconds = 0
    },

    release(): void {
      grab = null
      speed = 0
      update({ holding: false, petting: false })
    },

    /** Adds a velocity kick (degrees per second) to the head springs: a tap's bob or shake. */
    nudge(kick: Partial<Record<'x' | 'y' | 'z' | 'bodyX' | 'bodyZ', number>>): void {
      axes.x.velocity += kick.x ?? 0
      axes.y.velocity += kick.y ?? 0
      axes.z.velocity += kick.z ?? 0
      body.x.velocity += kick.bodyX ?? 0
      body.z.velocity += kick.bodyZ ?? 0
    },

    /** The angles to add this frame, or null once everything is back at rest after a release. */
    step(seconds: number): HeadPatPose | null {
      const dt = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), 0.1)
      if (grab) {
        stillSeconds += dt
        if (stillSeconds > stillAfterSeconds) speed *= Math.exp(-dt / HEAD_PAT_SPEED_SECONDS)
        if (speed >= HEAD_PAT_PETTING_SPEED) calmSeconds = 0
        else if (speed < HEAD_PAT_CALM_SPEED) calmSeconds += dt
        const petting = speed >= HEAD_PAT_PETTING_SPEED || (state.petting && calmSeconds < HEAD_PAT_CALM_SECONDS)
        update({ holding: true, petting })
        const target = headPatPose(grab.head, grab.start, grab.pointer)
        for (const key of ['x', 'y', 'z'] as const) stepSpring(axes[key], target[key], HEAD_PAT_HOLD_SPRING, dt)
      }
      else {
        if (springs.every(a => Math.abs(a.position) < restingDegrees && Math.abs(a.velocity) < restingDegrees)) {
          for (const a of springs) { a.position = 0; a.velocity = 0 }
          return null
        }
        for (const a of Object.values(axes)) stepSpring(a, 0, HEAD_PAT_RELEASE_SPRING, dt)
      }
      // The body follows where the head is, not where the hand is, so it lags behind it.
      stepSpring(body.x, axes.x.position * HEAD_PAT_BODY_SHARE.x, HEAD_PAT_BODY_SPRING, dt)
      stepSpring(body.z, axes.z.position * HEAD_PAT_BODY_SHARE.z, HEAD_PAT_BODY_SPRING, dt)
      return { x: axes.x.position, y: axes.y.position, z: axes.z.position, bodyX: body.x.position, bodyZ: body.z.position }
    },
  }
}

export type HeadPat = ReturnType<typeof createHeadPat>
