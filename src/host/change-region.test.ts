import { describe, expect, it } from 'vitest'
import { changeCenter, GRID_H, GRID_W, grayGrid } from './change-region'

function grid(fn: (x: number, y: number) => number): Float32Array {
  const rgba: number[] = []
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) { const v = fn(x, y); rgba.push(v, v, v, 255) }
  return grayGrid(rgba)
}

describe('changeCenter', () => {
  const blank = grid(() => 200)

  it('finds nothing on identical or slightly noisy frames', () => {
    expect(changeCenter(blank, grid(() => 200))).toBeNull()
    expect(changeCenter(blank, grid((x, y) => 200 + ((x + y) % 2 ? 5 : -5)))).toBeNull()
  })

  it('centers on the changed block', () => {
    // A 4x2 block in the lower right changes (a toast sliding in).
    const next = grid((x, y) => (x >= 26 && x < 30 && y >= 14 && y < 16 ? 40 : 200))
    const c = changeCenter(blank, next)!
    expect(c.cells).toBe(8)
    expect(c.x).toBeCloseTo(28 / GRID_W, 5)
    expect(c.y).toBeCloseTo(15 / GRID_H, 5)
  })

  it('weights strong changes over faint ones', () => {
    const next = grid((x, y) => (y === 2 && x === 2 ? 180 : y === 10 && x === 20 ? 20 : 200))
    const c = changeCenter(blank, next)!
    expect(c.x).toBeGreaterThan(15 / GRID_W)
    expect(c.y).toBeGreaterThan(8 / GRID_H)
  })

  it('rejects grids of different sizes', () => {
    expect(changeCenter(blank, new Float32Array(4))).toBeNull()
  })
})
