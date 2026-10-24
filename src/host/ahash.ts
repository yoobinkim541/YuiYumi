// Average hash over a small grayscale downscale (16x9 = 144 bits -> 36 hex chars).

export const HASH_W = 16
export const HASH_H = 9

/** `rgba` is the RGBA pixel buffer of a HASH_W x HASH_H image. */
export function averageHash(rgba: ArrayLike<number>, w = HASH_W, h = HASH_H): string {
  const n = w * h
  const gray = new Array<number>(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] ?? 0
    const g = rgba[i * 4 + 1] ?? 0
    const b = rgba[i * 4 + 2] ?? 0
    const v = 0.299 * r + 0.587 * g + 0.114 * b
    gray[i] = v
    sum += v
  }
  const mean = sum / n
  let hex = ''
  for (let i = 0; i < n; i += 4) {
    let nibble = 0
    for (let j = 0; j < 4; j++) nibble = (nibble << 1) | (i + j < n && gray[i + j]! > mean ? 1 : 0)
    hex += nibble.toString(16)
  }
  return hex
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

/** Bit distance between two hex hashes; different lengths count as maximally different. */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 4
  let d = 0
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!
  return d
}
