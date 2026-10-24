import { describe, expect, it } from 'vitest'
import { Glance, GLANCE, glanceDirection } from './procedural'

function run(g: Glance, ms: number, talking = false) {
  let out = null
  for (let t = 0; t < ms; t += 16) out = g.step(16, talking)
  return out
}

describe('Glance', () => {
  it('rests at null until asked to look', () => {
    expect(new Glance().step(16, false)).toBeNull()
  })

  it('turns the eyes most, the head moderately and the body only a few degrees', () => {
    const g = new Glance()
    g.look(1, -0.5, 4000)
    const early = g.step(50, false)!
    // The eyes lead; the head and body follow.
    expect(early.eyeX / GLANCE.eye.x).toBeGreaterThan(early.angleX / GLANCE.head.x)
    expect(early.angleX / GLANCE.head.x).toBeGreaterThan(early.bodyX / GLANCE.body.x)
    const held = run(g, 2000)!
    expect(held.eyeX).toBeCloseTo(GLANCE.eye.x, 2)
    expect(held.angleX).toBeCloseTo(GLANCE.head.x, 0)
    expect(held.bodyX).toBeLessThanOrEqual(GLANCE.body.x)
    expect(held.bodyX).toBeGreaterThan(3)
    expect(held.angleY).toBeLessThan(0)
  })

  it('eases back after the hold and keeps looking while she talks', () => {
    const g = new Glance()
    g.look(1, 0, 1000)
    expect(run(g, 3000, true)!.eyeX).toBeGreaterThan(0.8)
    run(g, 1000)
    expect(run(g, 5000)).toBeNull()
  })

  it('stops holding after the cap even if she keeps talking', () => {
    const g = new Glance()
    g.look(-1, 0, 1000)
    expect(run(g, GLANCE.maxHoldMs + 1200 + 5000, true)).toBeNull()
  })
})

describe('glanceDirection', () => {
  it('maps desktop offsets to -1..1 with y up', () => {
    const near = glanceDirection(100, 0)
    const far = glanceDirection(1500, 0)
    expect(near.x).toBeGreaterThan(0)
    expect(far.x).toBeGreaterThan(near.x)
    expect(far.x).toBeLessThan(1)
    expect(glanceDirection(0, 300).y).toBeLessThan(0)
    expect(glanceDirection(-300, 0).x).toBeLessThan(0)
  })
})
