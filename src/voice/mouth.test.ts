import { describe, expect, it } from 'vitest'
import { createMouthEnvelope, volumeFromRms } from './mouth'

describe('volumeFromRms', () => {
  it('maps log RMS into 0..1', () => {
    expect(volumeFromRms(0)).toBe(0)
    expect(volumeFromRms(10 ** -3)).toBe(0)
    expect(volumeFromRms(10 ** -2)).toBeCloseTo(0.5)
    expect(volumeFromRms(1)).toBe(1)
  })
})

describe('createMouthEnvelope', () => {
  it('opens on loud "A", stays closed on silence, and closes after speech', () => {
    const env = createMouthEnvelope()
    let v = 0
    for (let i = 0; i < 30; i++) v = env.update(1, { A: 1 }, 1 / 60)
    expect(v).toBeGreaterThan(0.8)
    expect(v).toBeLessThanOrEqual(1)
    for (let i = 0; i < 60; i++) v = env.update(0, { A: 1 }, 1 / 60)
    expect(v).toBe(0)
  })

  it('opens less for "I" than for "A"', () => {
    const a = createMouthEnvelope()
    const i = createMouthEnvelope()
    let va = 0
    let vi = 0
    for (let k = 0; k < 30; k++) {
      va = a.update(0.8, { A: 1 }, 1 / 60)
      vi = i.update(0.8, { I: 1 }, 1 / 60)
    }
    expect(vi).toBeLessThan(va)
    expect(vi).toBeGreaterThan(0)
  })

  it('works without viseme weights (RMS fallback)', () => {
    const env = createMouthEnvelope()
    let v = 0
    for (let k = 0; k < 30; k++) v = env.update(0.6, null, 1 / 60)
    expect(v).toBeGreaterThan(0.4)
  })
})
