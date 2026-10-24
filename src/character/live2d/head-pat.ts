// A hand on her head: pressing on it grabs that point, dragging pulls her head (and her
// body after it) toward the hand on damped springs, and the hand's speed tells slow
// petting from a fast rub. Adapted from AIRI (MIT).
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

/**
 * Angles in degrees, added on top of the motion: the head (ParamAngleX/Y/Z) and the body
 * swaying after it (ParamBodyAngleX turn, ParamBodyAngleZ tilt).
 */
export interface HeadPatPose {
  x: number
  y: number
  z: number
  bodyX: number
  bodyZ: number
}

/** How the held hand pets her: not at all (just holding or pulling), slowly, or fast. */
export type HeadPatPetting = 'none' | 'slow' | 'fast'

export interface HeadPatState {
  /** A press on her head is held. */
  holding: boolean
  /** How fast the held hand pets her. */
  petting: HeadPatPetting
}

export interface SpringAxis {
  position: number
  velocity: number
}

export interface HeadPatSpring {
  omega: number
  damping: number
  /** Soft cap on the acceleration, in degrees/s²: approached through tanh, never cut off. */
  maxAcceleration?: number
}

/**
 * The pressable head, in head radii around the eyes: an ellipse from the ear tips and
 * the top of the hair down to just below the eyes. Cheeks and chin are left out.
 */
export const HEAD_PAT_ZONE = { centerAbove: 0.9, halfWidth: 1.15, halfHeight: 1.35 } as const
/** The neck the head turns about, in head radii below the eyes. */
export const HEAD_PAT_PIVOT_BELOW = 1
/**
 * How she gives way to a pull, per axis: `scale · asinh(gain · pull)` degrees, with the
 * pull in head radii (the tilt's in radii² of torque about her neck). Near rest she
 * follows the hand at `scale · gain` degrees per radius; every further radius buys less,
 * so a long pull feels like her holding back. Head X/Y/Z: about 20/15/17° at one radius.
 */
export const HEAD_PAT_RESISTANCE = {
  x: { scale: 12, gain: 2.5 },
  y: { scale: 9, gain: 2.5 },
  z: { scale: 10, gain: 1.2 },
} as const
/**
 * How far the head turns at most, in degrees: the pose is left as is up to
 * HEAD_PAT_REACH_KNEE of it, then slows down more and more as it nears the limit instead
 * of running into it. The tilt stays further in, since idle motions already tip the head.
 */
export const HEAD_PAT_REACH = { x: 30, y: 20, z: 24 } as const
export const HEAD_PAT_REACH_KNEE = 0.5
/**
 * Held far off for a while, she heaves her head back toward rest, "nnngh... hup": a slow
 * effort that builds over most of a breath, a quick let-go, then a rest, each heave a
 * little longer or shorter than the last. At full effort the pose gives back
 * HEAD_PAT_TUG_SHARE of itself. The strain is the pull's length in head radii, smoothed
 * over HEAD_PAT_STRAIN_SECONDS so quick strokes do not count; heaving starts above
 * HEAD_PAT_STRAIN_START and is full at HEAD_PAT_STRAIN_FULL.
 */
export const HEAD_PAT_TUG_SHARE = 0.3
export const HEAD_PAT_STRAIN_SECONDS = 0.4
export const HEAD_PAT_STRAIN_START = 0.8
export const HEAD_PAT_STRAIN_FULL = 2
/**
 * One heave: its length in seconds (drawn per heave between the two), and where in it
 * the effort peaks and where the let-go is done, as shares of that length.
 */
export const HEAD_PAT_HEAVE = { shortest: 2, longest: 2.8, peak: 0.55, letGo: 0.68 } as const
/** A faint tremble while she strains, as a share of the effort, and its rate in Hz. */
const heaveTremble = { share: 0.06, hertz: 8 } as const
/**
 * The head's spring while held: quick (about 0.2 s to follow the hand) and a little
 * loose, so it swings about 12 % past where the hand turns back and wobbles on. Its
 * acceleration is capped softly, so a wild shake turns around in smooth arcs instead of
 * slamming from side to side.
 */
export const HEAD_PAT_HOLD_SPRING = { omega: 22, damping: 0.55, maxAcceleration: 6000 } as const
/** After a release the head bounces back to rest. */
export const HEAD_PAT_RELEASE_SPRING = { omega: 9, damping: 0.6, maxAcceleration: 6000 } as const
/** The body turns and tilts this share of the way the head does... */
export const HEAD_PAT_BODY_SHARE = { x: 0.4, z: 0.35 } as const
/** ...easing off toward this many degrees, well inside the body's range, however far the head goes. */
export const HEAD_PAT_BODY_REACH = 6
/**
 * The body trails the head, heavier and calmer than it, so a wild shake rocks her
 * instead of knocking her from side to side.
 */
export const HEAD_PAT_BODY_SPRING = { omega: 10, damping: 0.65, maxAcceleration: 2000 } as const
/**
 * Hand speed, in head radii per second, smoothed over HEAD_PAT_SPEED_SECONDS. Each
 * petting level starts at its `start` speed and ends once the speed stays below its
 * `calm` speed for `calmSeconds`, so she does not flicker between faces. A slow drag only
 * pulls her head along; stroking her head counts as slow petting and a vigorous rub
 * (about two head widths back and forth three times a second) as fast.
 */
export const HEAD_PAT_SPEED_SECONDS = 0.25
export const HEAD_PAT_PETTING = {
  slow: { start: 2.5, calm: 1.2, calmSeconds: 0.5 },
  fast: { start: 7, calm: 5, calmSeconds: 0.4 },
} as const

/** A move event older than this counts as the hand having stopped; the speed then decays. */
const stillAfterSeconds = 0.05
/** Below this, a released pose counts as back at rest. */
const restingDegrees = 0.01
/** Spring substep, short enough for the semi-implicit integration to stay stable. */
const springStepSeconds = 1 / 480

/**
 * Keeps `value` inside [min, max] without a hard stop: unchanged within `knee` of the
 * half range around the center, then easing toward the bound through tanh with the same
 * value and slope at the bend.
 */
export function softLimit(value: number, min: number, max: number, knee = 0.8): number {
  const center = (min + max) / 2
  const half = (max - min) / 2
  const linear = half * knee
  const offset = value - center
  const magnitude = Math.abs(offset)
  if (magnitude <= linear) return value
  const room = half - linear
  return center + Math.sign(offset) * (linear + room * Math.tanh((magnitude - linear) / room))
}

/**
 * Adds `offset` to `base` without running into the parameter's limit: the full offset
 * while it uses up to `knee` of the room left between `base` and the limit it heads for,
 * then easing toward that limit. `base` itself is never moved, so a layer added on top of
 * a motion keeps the motion's pose and only its own push slows down near the wall.
 */
export function softAdd(base: number, offset: number, min: number, max: number, knee = 0.5): number {
  const room = offset >= 0 ? max - base : base - min
  if (!(room > 0)) return base
  const linear = room * knee
  const magnitude = Math.abs(offset)
  if (magnitude <= linear) return base + offset
  const bend = room - linear
  return base + Math.sign(offset) * (linear + bend * Math.tanh((magnitude - linear) / bend))
}

/** Advances a damped spring toward `target` (damping ratio below 1 swings past it). */
export function stepSpring(axis: SpringAxis, target: number, spring: HeadPatSpring, seconds: number): void {
  const steps = Math.max(1, Math.ceil(seconds / springStepSeconds))
  const h = seconds / steps
  const cap = spring.maxAcceleration
  for (let i = 0; i < steps; i++) {
    const pull = -2 * spring.damping * spring.omega * axis.velocity - spring.omega * spring.omega * (axis.position - target)
    axis.velocity += (cap ? cap * Math.tanh(pull / cap) : pull) * h
    axis.position += axis.velocity * h
  }
}

/** A heave's length for its `index`: a fixed scatter between the shortest and the longest. */
function heaveSeconds(index: number): number {
  const scatter = Math.sin(index * 12.9898 + 4.1) * 43758.5453
  return HEAD_PAT_HEAVE.shortest + (HEAD_PAT_HEAVE.longest - HEAD_PAT_HEAVE.shortest) * (scatter - Math.floor(scatter))
}

/**
 * Her effort, from 0 to 1, `seconds` into a heave of `length`: a slow ease up to the
 * peak with a faint tremble, a quick eased let-go, then nothing until the next heave.
 */
export function headPatHeaveEffort(seconds: number, length: number): number {
  const ease = (u: number) => u * u * (3 - 2 * u)
  const peak = length * HEAD_PAT_HEAVE.peak
  const letGo = length * HEAD_PAT_HEAVE.letGo
  if (seconds < peak) {
    const rise = ease(seconds / peak)
    return rise * (1 + heaveTremble.share * rise * Math.sin(2 * Math.PI * heaveTremble.hertz * seconds))
  }
  if (seconds < letGo) return 1 - ease((seconds - peak) / (letGo - peak))
  return 0
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
 * the neck tilts it (a hand on the crown moving right tips the crown right). Each angle
 * gives way less the further it goes (HEAD_PAT_RESISTANCE) and slows down into its reach
 * (HEAD_PAT_REACH) instead of stopping at it.
 */
export function headPatPose(head: HeadPatHead, start: Point2, pointer: Point2): Pick<HeadPatPose, 'x' | 'y' | 'z'> {
  const pullX = (pointer.x - start.x) / head.radius
  const pullY = (pointer.y - start.y) / head.radius
  const leverX = (start.x - head.x) / head.radius
  const leverY = (start.y - (head.y + head.radius * HEAD_PAT_PIVOT_BELOW)) / head.radius
  // Screen y points down, so a positive cross product turns the grabbed point clockwise
  // on screen, which ParamAngleZ > 0 does to her head.
  const torque = leverX * pullY - leverY * pullX
  const give = (axis: keyof typeof HEAD_PAT_RESISTANCE, pull: number) => {
    const angle = HEAD_PAT_RESISTANCE[axis].scale * Math.asinh(HEAD_PAT_RESISTANCE[axis].gain * pull)
    return softLimit(angle, -HEAD_PAT_REACH[axis], HEAD_PAT_REACH[axis], HEAD_PAT_REACH_KNEE)
  }
  return { x: give('x', pullX), y: give('y', -pullY), z: give('z', torque) }
}

/**
 * `step(seconds)` gives the head and body angles to add this frame, or `null` once they
 * are back at rest after a release. `onChange` hears every change of holding/petting.
 */
export function createHeadPat(options: { onChange?: (state: HeadPatState) => void } = {}) {
  let grab: { head: HeadPatHead, start: Point2, pointer: Point2, movedAt: number } | null = null
  let speed = 0
  /** Seconds each petting level has spent below its calm speed. */
  const calmSeconds = { slow: 0, fast: 0 }
  const state: HeadPatState = { holding: false, petting: 'none' }
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
  /** Seconds since the last move, as the render loop counts them. */
  let stillSeconds = 0
  /** The pull's length in head radii, smoothed; how hard she is being held off. */
  let strain = 0
  /** The current heave: its number and the seconds into it. */
  let heave = { index: 0, seconds: 0 }

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
      calmSeconds.slow = 0
      calmSeconds.fast = 0
      strain = 0
      heave = { index: 0, seconds: 0 }
      update({ holding: true, petting: 'none' })
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
      update({ holding: false, petting: 'none' })
    },

    /** Adds a velocity kick (degrees per second) to the springs: a tap's bob or shake. */
    nudge(kick: Partial<Record<'x' | 'y' | 'z' | 'bodyX' | 'bodyZ', number>>): void {
      axes.x.velocity += kick.x ?? 0
      axes.y.velocity += kick.y ?? 0
      axes.z.velocity += kick.z ?? 0
      body.x.velocity += kick.bodyX ?? 0
      body.z.velocity += kick.bodyZ ?? 0
    },

    step(seconds: number): HeadPatPose | null {
      const dt = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), 0.1)
      if (grab) {
        stillSeconds += dt
        if (stillSeconds > stillAfterSeconds) speed *= Math.exp(-dt / HEAD_PAT_SPEED_SECONDS)
        const level = (name: 'slow' | 'fast', was: boolean) => {
          const { start, calm, calmSeconds: calmFor } = HEAD_PAT_PETTING[name]
          if (speed >= start) calmSeconds[name] = 0
          else if (speed < calm) calmSeconds[name] += dt
          return speed >= start || (was && calmSeconds[name] < calmFor)
        }
        const slow = level('slow', state.petting !== 'none')
        const fast = level('fast', state.petting === 'fast') && slow
        update({ holding: true, petting: fast ? 'fast' : slow ? 'slow' : 'none' })

        // Held off long enough, she heaves her head back toward rest now and then.
        const pull = Math.hypot(grab.pointer.x - grab.start.x, grab.pointer.y - grab.start.y) / grab.head.radius
        strain += (pull - strain) * (1 - Math.exp(-dt / HEAD_PAT_STRAIN_SECONDS))
        const tension = Math.min(1, Math.max(0, (strain - HEAD_PAT_STRAIN_START) / (HEAD_PAT_STRAIN_FULL - HEAD_PAT_STRAIN_START)))
        // A heave starts from the beginning once she is held off, not halfway through one.
        if (tension > 0) {
          heave.seconds += dt
          if (heave.seconds >= heaveSeconds(heave.index))
            heave = { index: heave.index + 1, seconds: heave.seconds - heaveSeconds(heave.index) }
        }
        else if (headPatHeaveEffort(heave.seconds, heaveSeconds(heave.index)) === 0) {
          heave.seconds = 0
        }
        const effort = headPatHeaveEffort(heave.seconds, heaveSeconds(heave.index))
        const giveWay = 1 - HEAD_PAT_TUG_SHARE * tension * tension * (3 - 2 * tension) * effort

        const target = headPatPose(grab.head, grab.start, grab.pointer)
        for (const key of ['x', 'y', 'z'] as const) stepSpring(axes[key], target[key] * giveWay, HEAD_PAT_HOLD_SPRING, dt)
      }
      else {
        if (springs.every(a => Math.abs(a.position) < restingDegrees && Math.abs(a.velocity) < restingDegrees)) {
          for (const a of springs) { a.position = 0; a.velocity = 0 }
          return null
        }
        for (const a of Object.values(axes)) stepSpring(a, 0, HEAD_PAT_RELEASE_SPRING, dt)
      }
      // The body follows where the head is, not where the hand is, so it lags behind it,
      // and eases off well inside its range however far the head goes.
      const reach = (share: number, head: number) => HEAD_PAT_BODY_REACH * Math.tanh(share * head / HEAD_PAT_BODY_REACH)
      stepSpring(body.x, reach(HEAD_PAT_BODY_SHARE.x, axes.x.position), HEAD_PAT_BODY_SPRING, dt)
      stepSpring(body.z, reach(HEAD_PAT_BODY_SHARE.z, axes.z.position), HEAD_PAT_BODY_SPRING, dt)
      return { x: axes.x.position, y: axes.y.position, z: axes.z.position, bodyX: body.x.position, bodyZ: body.z.position }
    },
  }
}

export type HeadPat = ReturnType<typeof createHeadPat>
