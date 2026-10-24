import { describe, expect, it } from 'vitest'
import { createHeadPat, headPatPose, headPatZoneContains, stepSpring, type HeadPatState } from './head-pat'
import { pointInTriangle, TouchGestures } from './touch'

const head = { x: 100, y: 100, radius: 40 }

describe('head-pat geometry', () => {
  it('covers the top of the head but not the chin', () => {
    expect(headPatZoneContains(head, { x: 100, y: 60 })).toBe(true)
    expect(headPatZoneContains(head, { x: 100, y: 160 })).toBe(false)
    expect(headPatZoneContains({ ...head, radius: 0 }, { x: 100, y: 100 })).toBe(false)
  })

  it('turns toward a sideways pull and tips the top of the head with it', () => {
    const top = { x: 100, y: 50 }
    const pose = headPatPose(head, top, { x: 140, y: 50 })
    expect(pose.x).toBeGreaterThan(10)
    expect(pose.z).toBeGreaterThan(0)
    expect(Math.abs(pose.y)).toBeLessThan(1e-9)
    // Pulling up nods the head up (positive ParamAngleY).
    expect(headPatPose(head, top, { x: 100, y: 10 }).y).toBeGreaterThan(10)
  })
})

describe('stepSpring', () => {
  it('settles on the target and overshoots when underdamped', () => {
    const axis = { position: 0, velocity: 0 }
    let peak = 0
    for (let i = 0; i < 120; i++) {
      stepSpring(axis, 10, { omega: 22, damping: 0.55 }, 1 / 60)
      peak = Math.max(peak, axis.position)
    }
    expect(peak).toBeGreaterThan(10.5)
    expect(axis.position).toBeCloseTo(10, 2)
  })
})

describe('createHeadPat', () => {
  it('follows a held drag, detects fast petting and returns to rest after release', () => {
    const changes: HeadPatState[] = []
    const pat = createHeadPat({ onChange: s => changes.push(s) })
    expect(pat.press({ x: 100, y: 200 }, head, 0)).toBe(false)
    expect(pat.press({ x: 100, y: 60 }, head, 0)).toBe(true)
    // Fast back-and-forth: 1.5 head radii every 50 ms = 30 radii/s.
    let t = 0
    for (let i = 0; i < 20; i++) {
      t += 50
      pat.move({ x: 100 + (i % 2 ? -30 : 30), y: 60 }, t)
      pat.step(0.05)
    }
    expect(pat.state.petting).toBe(true)
    pat.release()
    expect(changes.at(-1)).toEqual({ holding: false, petting: false })
    let pose = pat.step(0.016)
    expect(pose).not.toBeNull()
    for (let i = 0; i < 600 && pose; i++) pose = pat.step(0.016)
    expect(pose).toBeNull()
  })

  it('a slow drag pulls the head without petting, and the body trails it', () => {
    const pat = createHeadPat()
    pat.press({ x: 100, y: 60 }, head, 0)
    let pose = null
    for (let i = 1; i <= 60; i++) {
      pat.move({ x: 100 + i * 0.5, y: 60 }, i * 16)
      pose = pat.step(0.016)
    }
    expect(pat.state.petting).toBe(false)
    expect(pose!.x).toBeGreaterThan(5)
    expect(pose!.bodyX).toBeGreaterThan(0)
    expect(pose!.bodyX).toBeLessThan(pose!.x)
  })
})

describe('TouchGestures', () => {
  it('classifies taps, pokes and petting', () => {
    const g = new TouchGestures()
    g.down('body', 0, 0, 0)
    expect(g.up(100)).toEqual({ kind: 'tap', region: 'body' })
    g.down('head', 0, 0, 500)
    expect(g.up(600)).toEqual({ kind: 'tap', region: 'head' })
    g.down('head', 0, 0, 1000)
    expect(g.up(1100)).toEqual({ kind: 'pout' })
    // A long drag without petting earns nothing.
    g.down('head', 0, 0, 5000)
    g.move(80, 0)
    expect(g.up(6000)).toBeNull()
    // Petting for 800 ms.
    g.down('head', 0, 0, 7000)
    g.petting(true, 7100)
    g.petting(false, 7900)
    expect(g.up(8000)).toEqual({ kind: 'pet', ms: 800 })
  })

  it('forgets taps outside the poke window', () => {
    const g = new TouchGestures()
    for (const t of [0, 3000, 6000]) {
      g.down('body', 0, 0, t)
      expect(g.up(t + 50)?.kind).toBe('tap')
    }
  })
})

describe('pointInTriangle', () => {
  it('works for both windings', () => {
    expect(pointInTriangle(1, 1, 0, 0, 4, 0, 0, 4)).toBe(true)
    expect(pointInTriangle(1, 1, 0, 0, 0, 4, 4, 0)).toBe(true)
    expect(pointInTriangle(5, 5, 0, 0, 4, 0, 0, 4)).toBe(false)
  })
})
