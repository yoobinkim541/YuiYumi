import { describe, expect, it } from 'vitest'
import { averageHash, hammingHex, HASH_H, HASH_W } from '@/host/ahash'
import { DwellTracker } from './dwell'

function img(fn: (x: number, y: number) => number): number[] {
  const out: number[] = []
  for (let y = 0; y < HASH_H; y++) for (let x = 0; x < HASH_W; x++) { const v = fn(x, y); out.push(v, v, v, 255) }
  return out
}

describe('averageHash', () => {
  it('is 36 hex chars and stable', () => {
    const a = averageHash(img(x => x * 16))
    expect(a).toHaveLength(36)
    expect(averageHash(img(x => x * 16))).toBe(a)
  })
  it('separates different screens and tolerates small changes', () => {
    const left = averageHash(img(x => (x < 8 ? 240 : 20)))
    const right = averageHash(img(x => (x < 8 ? 20 : 240)))
    const leftNoisy = averageHash(img((x, y) => (x < 8 ? 240 : 20) + (x === 15 && y === 0 ? 230 : 0)))
    expect(hammingHex(left, right)).toBeGreaterThan(100)
    expect(hammingHex(left, leftNoisy)).toBeLessThanOrEqual(2)
  })
})

describe('DwellTracker', () => {
  const A = '0'.repeat(36)
  const A2 = '1' + '0'.repeat(35)
  const B = 'f'.repeat(36)

  it('counts seconds on the same screen and resets on change', () => {
    const d = new DwellTracker()
    expect(d.update(A, 0)).toBe(0)
    expect(d.update(A2, 9_000)).toBe(9)
    expect(d.update(A, 21_000)).toBe(21)
    expect(d.update(B, 24_000)).toBe(0)
    expect(d.update(B, 27_000)).toBe(3)
  })
  it('reset starts over', () => {
    const d = new DwellTracker()
    d.update(A, 0)
    d.reset()
    expect(d.update(A, 30_000)).toBe(0)
  })
})
