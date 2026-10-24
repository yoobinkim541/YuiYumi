// Behavior tests for the head-pat springs and petting levels. Adapted from AIRI (MIT).
import type { HeadPatState } from './head-pat'

import { describe, expect, it } from 'vitest'

import {
  createHeadPat,
  HEAD_PAT_BODY_REACH,
  HEAD_PAT_HOLD_SPRING,
  HEAD_PAT_PETTING,
  HEAD_PAT_REACH,
  headPatHeaveEffort,
  headPatPose,
  softAdd,
  softLimit,
} from './head-pat'

const head = { x: 200, y: 200, radius: 80 }
/** The top of her head, where a pat lands. */
const crown = { x: 200, y: 110 }
const frame = 1 / 120

/** A hand on her head, with a clock and a recorder of every state change. */
function createHand() {
  const changes: HeadPatState[] = []
  const pat = createHeadPat({ onChange: state => changes.push(state) })
  let nowMs = 0
  let pose: ReturnType<typeof pat.step> = null

  /** Runs `seconds` of frames, moving the hand to `at(t)` each frame (t in seconds since the call). */
  function hold(seconds: number, at?: (t: number) => { x: number, y: number }) {
    const frames = Math.round(seconds / frame)
    for (let index = 1; index <= frames; index++) {
      nowMs += frame * 1000
      if (at)
        pat.move(at(index * frame), nowMs)
      pose = pat.step(frame)
    }
    return pose
  }

  return { pat, changes, hold, press: (point = crown) => pat.press(point, head, nowMs) }
}

describe('head pat', () => {
  it('grabs her head only on the top of her head', () => {
    const { pat } = createHand()
    expect(pat.press({ x: 200, y: 40 }, head, 0)).toBe(true) // ears
    expect(pat.press({ x: 290, y: 150 }, head, 0)).toBe(true) // side of the hair
    expect(pat.press({ x: 200, y: 260 }, head, 0)).toBe(false) // chin
    expect(pat.press({ x: 320, y: 200 }, head, 0)).toBe(false) // beside her
    expect(pat.press({ x: 200, y: -20 }, head, 0)).toBe(false) // above her
  })

  it('pulls her head after the hand: a hand on the crown moving right turns and tips it right', () => {
    const { press, hold } = createHand()
    press()
    const right = hold(1, () => ({ x: crown.x + 60, y: crown.y }))!
    expect(right.x).toBeGreaterThan(5)
    expect(right.z).toBeGreaterThan(5)
    expect(Math.abs(right.y)).toBeLessThan(0.1)

    const down = hold(1, () => ({ x: crown.x, y: crown.y + 60 }))!
    expect(down.y).toBeLessThan(-5)
    expect(Math.abs(down.x)).toBeLessThan(0.5)
    expect(Math.abs(down.z)).toBeLessThan(0.5)
  })

  it('sways her body after her head: the same way, less far, and a little later', () => {
    const { pat, press } = createHand()
    press()
    let nowMs = 0
    const samples: { t: number, head: number, body: number, headZ: number, bodyZ: number }[] = []
    for (let index = 1; index <= 3 / frame; index++) {
      const t = index * frame
      nowMs += frame * 1000
      pat.move({ x: crown.x + 40 * Math.sin(2 * Math.PI * 2 * t), y: crown.y }, nowMs)
      const pose = pat.step(frame)!
      if (t > 1.5)
        samples.push({ t, head: pose.x, body: pose.bodyX, headZ: pose.z, bodyZ: pose.bodyZ })
    }
    const peak = (key: 'head' | 'body') => samples.reduce((best, sample) => sample[key] > best[key] ? sample : best)
    expect(peak('body').body).toBeGreaterThan(2)
    expect(peak('body').body).toBeLessThan(peak('head').head)
    expect(Math.max(...samples.map(sample => sample.bodyZ))).toBeGreaterThan(2)
    expect(Math.max(...samples.map(sample => sample.bodyZ))).toBeLessThan(Math.max(...samples.map(sample => sample.headZ)))
    // Within one stroke (0.5 s), the body peaks after the head.
    const lag = (peak('body').t - peak('head').t + 0.5) % 0.5
    expect(lag).toBeGreaterThan(0.01)
    expect(lag).toBeLessThan(0.2)
  })

  it('gives way less the further she is pulled, slowing into its reach instead of hitting it', () => {
    const pose = (radii: number) => headPatPose(head, crown, { x: crown.x + radii * head.radius, y: crown.y })
    const steps = [0, 1, 2, 3, 5, 10].map(radii => pose(radii).x)
    // Every further pull still turns her head...
    expect(steps.every((angle, i) => i === 0 || angle > steps[i - 1])).toBe(true)
    // ...but each radius buys less than the one before...
    const perRadius = steps.slice(1).map((angle, i) => (angle - steps[i]) / ([1, 1, 1, 2, 5][i]))
    expect(perRadius.every((gain, i) => i === 0 || gain < perRadius[i - 1])).toBe(true)
    // ...and however far she is pulled, no axis reaches its limit.
    const far = pose(30)
    expect(far.x).toBeLessThan(HEAD_PAT_REACH.x)
    expect(Math.abs(far.z)).toBeLessThan(HEAD_PAT_REACH.z)
    expect(far.x).toBeGreaterThan(0.9 * HEAD_PAT_REACH.x)
  })

  it('tugs her head back now and then while held far off, but not while held near', () => {
    const swing = (radii: number) => {
      const { press, hold } = createHand()
      press()
      hold(1.5, () => ({ x: crown.x + radii * head.radius, y: crown.y }))
      const turns: number[] = []
      for (let index = 0; index < 3 / frame; index++)
        turns.push(hold(frame)!.x)
      return { least: Math.min(...turns), most: Math.max(...turns) }
    }
    const near = swing(0.3)
    expect(near.most - near.least).toBeLessThan(0.05)

    const far = swing(2.5)
    // Pulled toward rest by a good share of the pose, and back out again.
    expect(far.most - far.least).toBeGreaterThan(0.12 * far.most)
    expect(far.least).toBeGreaterThan(0.6 * far.most)
  })

  it('heaves slowly and lets go quickly ("nnngh... hup"), not in twitches', () => {
    const length = 2.4
    const effort = Array.from({ length: 2401 }, (_, i) => headPatHeaveEffort(i / 1000, length))
    const first = (level: number, from = 0) => effort.findIndex((value, i) => i >= from && value >= level) / 1000
    const peakAt = effort.indexOf(Math.max(...effort))
    const lastAbove = (level: number) => (peakAt + effort.slice(peakAt).findIndex(value => value < level)) / 1000
    // The strain builds over most of a second...
    expect(first(0.9) - first(0.1)).toBeGreaterThan(0.7)
    // ...the let-go takes a fraction of that...
    expect(lastAbove(0.1) - lastAbove(0.9)).toBeLessThan(0.3)
    // ...and she rests before the next heave.
    expect(effort.slice(-400).every(value => value === 0)).toBe(true)
  })

  it('turns a wild shake into smooth swings that keep the body well inside its range', () => {
    const { press, hold } = createHand()
    press()
    const poses: NonNullable<ReturnType<typeof hold>>[] = []
    // A rough, wide shake: the hand reverses instantly, five radii end to end, three times a second.
    const shake = (t: number) => {
      const phase = (t * 3) % 1
      return { x: crown.x + 2.5 * head.radius * (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase), y: crown.y }
    }
    hold(1.5, shake)
    for (let index = 0; index < 2 / frame; index++)
      poses.push(hold(frame, () => shake(1.5 + index * frame))!)
    let fastest = 0
    for (let i = 2; i < poses.length; i++)
      fastest = Math.max(fastest, Math.abs(poses[i].x - 2 * poses[i - 1].x + poses[i - 2].x) / (frame * frame))
    expect(fastest).toBeLessThan(HEAD_PAT_HOLD_SPRING.maxAcceleration * 1.05)
    expect(Math.max(...poses.map(pose => Math.abs(pose.x)))).toBeGreaterThan(10)
    expect(Math.max(...poses.map(pose => Math.abs(pose.bodyX)))).toBeLessThan(HEAD_PAT_BODY_REACH)
    expect(Math.max(...poses.map(pose => Math.abs(pose.bodyZ)))).toBeLessThan(HEAD_PAT_BODY_REACH)
  })

  it('tells a slow pat from a fast rub, and calms down a level at a time', () => {
    const { press, hold, changes, pat } = createHand()
    press()
    expect(changes).toEqual([{ holding: true, petting: 'none' }])

    // A slow drag across her head (one radius a second) only pulls it along.
    hold(1, t => ({ x: crown.x + 80 * t, y: crown.y }))
    expect(pat.state.petting).toBe('none')

    // Gentle strokes, two a second, under half a radius each way: slow petting.
    hold(1.5, t => ({ x: crown.x + 80 + 32 * Math.sin(2 * Math.PI * 2 * t), y: crown.y }))
    expect(pat.state.petting).toBe('slow')

    // A vigorous rub, a radius each way three times a second: fast.
    hold(1, t => ({ x: crown.x + 80 + 80 * Math.sin(2 * Math.PI * 3 * t), y: crown.y }))
    expect(pat.state.petting).toBe('fast')

    // Resting the hand steps back down, not at once and not straight to nothing.
    hold(HEAD_PAT_PETTING.fast.calmSeconds / 2)
    expect(pat.state.petting).toBe('fast')
    hold(3)
    expect(pat.state).toEqual({ holding: true, petting: 'none' })
    expect(changes.map(change => change.petting)).toEqual(['none', 'slow', 'fast', 'slow', 'none'])
  })

  it('lets go when released: petting ends at once and her head settles back to rest', () => {
    const { press, hold, pat, changes } = createHand()
    press()
    hold(1, t => ({ x: crown.x + 60 * Math.sin(2 * Math.PI * 3 * t), y: crown.y + 40 }))
    expect(pat.state.petting).not.toBe('none')

    pat.release()
    expect(changes.at(-1)).toEqual({ holding: false, petting: 'none' })
    // Eased back, not snapped: the first frame after the release is still turned.
    const first = hold(frame)!
    expect(Math.abs(first.y)).toBeGreaterThan(1)
    expect(hold(3)).toBeNull()
  })

  it('keeps a tap\'s nudge: a velocity kick bobs the head and settles back', () => {
    const { pat, hold } = createHand()
    pat.nudge({ y: -160, z: 40 })
    const bob = hold(0.1)!
    expect(bob.y).toBeLessThan(-1)
    expect(hold(4)).toBeNull()
  })
})

describe('soft limits', () => {
  it('softLimit leaves the middle alone and approaches the bounds without reaching them', () => {
    expect(softLimit(5, -30, 30, 0.5)).toBe(5)
    expect(softLimit(100, -30, 30, 0.5)).toBeLessThan(30)
    expect(softLimit(100, -30, 30, 0.5)).toBeGreaterThan(29)
    expect(softLimit(-100, -30, 30, 0.5)).toBeGreaterThan(-30)
  })

  it('softAdd keeps the base and eases only the added offset into the limit', () => {
    expect(softAdd(10, 5, -30, 30)).toBe(15)
    const far = softAdd(10, 50, -30, 30)
    expect(far).toBeLessThan(30)
    expect(far).toBeGreaterThan(25)
    expect(softAdd(30, 5, -30, 30)).toBe(30)
    expect(softAdd(10, -50, -30, 30)).toBeGreaterThan(-30)
  })
})
