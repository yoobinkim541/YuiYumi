// Spike helper: compare two raw RGBA dumps from cdp-shot.mjs.
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2).map((f) => readFileSync(f))
if (a.length !== b.length) throw new Error(`size mismatch ${a.length} vs ${b.length}`)
let n1 = 0, n3 = 0, n16 = 0, max = 0, nonBg = 0
for (let i = 0; i < a.length; i += 4) {
  let d = 0
  for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k]))
  if (a[i + 3] > 0) nonBg++
  if (d > 1) n1++
  if (d > 3) n3++
  if (d > 16) n16++
  max = Math.max(max, d)
}
console.log(JSON.stringify({ pixels: a.length / 4, modelPixels: nonBg, diffOver1: n1, diffOver3: n3, diffOver16: n16, maxDiff: max }))
