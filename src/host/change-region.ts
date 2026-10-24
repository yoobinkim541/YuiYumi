// Where the screen changed between two captures: a coarse grayscale grid of each frame,
// compared cell by cell. The weighted center of the changed cells is where the user just
// did something (opened a mail, typed a line, a notification slid in).

export const GRID_W = 32
export const GRID_H = 18
/** Gray-level difference (0..255) below which a cell counts as unchanged (JPEG noise, caret blink). */
export const CHANGE_THRESHOLD = 14

/** Grayscale values of a GRID_W x GRID_H RGBA buffer. */
export function grayGrid(rgba: ArrayLike<number>, w = GRID_W, h = GRID_H): Float32Array {
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) {
    out[i] = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0)
  }
  return out
}

/**
 * Center of change between two grids as shares (0..1) of the grid width and height,
 * weighted by how much each cell changed; null when nothing changed past the threshold.
 */
export function changeCenter(prev: ArrayLike<number>, next: ArrayLike<number>, w = GRID_W, h = GRID_H, threshold = CHANGE_THRESHOLD): { x: number, y: number, cells: number } | null {
  if (prev.length !== next.length || next.length !== w * h) return null
  let sum = 0, sx = 0, sy = 0, cells = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs((next[y * w + x] ?? 0) - (prev[y * w + x] ?? 0))
      if (d < threshold) continue
      cells++
      sum += d
      sx += d * (x + 0.5)
      sy += d * (y + 0.5)
    }
  }
  return cells ? { x: sx / sum / w, y: sy / sum / h, cells } : null
}
