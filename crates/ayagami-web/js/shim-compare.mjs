// Spike check: drive the Live2DCubismCore-shaped facade (ayagami-cubism-core.mjs)
// and the official Cubism Core through the same Core-API calls the Cubism 4
// framework makes (write parameters.values, update(), read drawables, reset
// dynamic flags), and compare everything the batched renderer reads.
//
// Usage: node js/shim-compare.mjs [model.moc3]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { createAyagamiCubismCore } from './ayagami-cubism-core.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const mocPath = process.argv[2] ?? resolve(root, 'models/TT2.0/TT2.0.moc3')
const mocBytes = readFileSync(mocPath)
const mocAb = mocBytes.buffer.slice(mocBytes.byteOffset, mocBytes.byteOffset + mocBytes.byteLength)

const A = await createAyagamiCubismCore(readFileSync(resolve(here, '../target/wasm32-unknown-unknown/release/ayagami_web.wasm')))

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = resolve(root, 'public/vendor')
globalThis.__filename = resolve(root, 'public/vendor/live2dcubismcore.min.js')
vm.runInThisContext(readFileSync(resolve(root, 'public/vendor/live2dcubismcore.min.js'), 'utf8') + '\nglobalThis.Live2DCubismCore = Live2DCubismCore;')
await new Promise((r) => setTimeout(r, 300))
const C = globalThis.Live2DCubismCore

const am = A.Model.fromMoc(A.Moc.fromArrayBuffer(mocAb))
const cm = C.Model.fromMoc(C.Moc.fromArrayBuffer(mocAb))
if (!am) throw new Error('facade load failed')

const ci = cm.canvasinfo, ai = am.canvasinfo
console.log('canvasinfo core', JSON.stringify({ ...ci }), '\ncanvasinfo ayg ', JSON.stringify(ai))
const eqArr = (a, b) => a.length === b.length && Array.from(a).every((v, i) => v === b[i])
console.log('param ids equal', eqArr(am.parameters.ids, cm.parameters.ids), '| part ids equal', eqArr(am.parts.ids, cm.parts.ids),
  '| part parents equal', eqArr(am.parts.parentIndices, cm.parts.parentIndices),
  '| drawable parent parts equal', eqArr(am.drawables.parentPartIndices, cm.drawables.parentPartIndices))

// The batched renderer's heap-span preconditions.
function heapSpanCheck(drawables) {
  let buf, base = Infinity
  for (let i = 0; i < drawables.count; i++) {
    if (!drawables.vertexCounts[i]) continue
    const v = drawables.vertexPositions[i]
    buf ??= v.buffer
    if (v.buffer !== buf) return 'more than one buffer'
    base = Math.min(base, v.byteOffset)
  }
  for (let i = 0; i < drawables.count; i++)
    if (drawables.vertexCounts[i] && (drawables.vertexPositions[i].byteOffset - base) % 8) return 'misaligned'
  return 'ok'
}
console.log('heap span check: ayagami', heapSpanCheck(am.drawables), '| core', heapSpanCheck(cm.drawables))

const N = am.drawables.count
const mins = cm.parameters.minimumValues, maxs = cm.parameters.maximumValues
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const memBefore = A.Model && am.drawables.vertexPositions[0].buffer.byteLength
let worst = { pos: 0, op: 0, opFrames: 0, visibleOrderFrames: 0, absoluteOrderFrames: 0, vis: 0, vpChangedMissed: 0 }
let tA = 0, tC = 0, dbgCount = 0
const frames = 300
for (let f = 0; f < frames; f++) {
  // Mostly smooth motion with occasional random full poses and part fades.
  for (let p = 0; p < cm.parameters.count; p++) {
    const v = f % 50 === 0 ? mins[p] + (maxs[p] - mins[p]) * rnd() : cm.parameters.values[p] + (rnd() - 0.5) * 0.05 * (maxs[p] - mins[p])
    const cl = Math.min(maxs[p], Math.max(mins[p], v))
    cm.parameters.values[p] = cl
    am.parameters.values[p] = cl
  }
  if (f % 30 === 0) {
    const k = Math.floor(rnd() * cm.parts.count), o = rnd()
    cm.parts.opacities[k] = o
    am.parts.opacities[k] = o
  }
  let t = performance.now(); am.update(); tA += performance.now() - t
  t = performance.now(); cm.update(); tC += performance.now() - t
  const a = am.drawables, c = cm.drawables
  for (let i = 0; i < N; i++) {
    const cv = (c.dynamicFlags[i] & 1) === 1
    if (cv !== ((a.dynamicFlags[i] & 1) === 1)) worst.vis++
    if (!cv) continue
    const cp = c.vertexPositions[i], ap = a.vertexPositions[i]
    for (let k = 0; k < cp.length; k++) worst.pos = Math.max(worst.pos, Math.abs(cp[k] - ap[k]))
    worst.op = Math.max(worst.op, Math.abs(c.opacities[i] - a.opacities[i]))
    if (Math.abs(c.opacities[i] - a.opacities[i]) > 1e-3) worst.opFrames++
    if ((c.dynamicFlags[i] & 32) && !(a.dynamicFlags[i] & 32)) worst.vpChangedMissed++
  }
  if (process.env.DBG) {
    let no = 0, nop = 0, firstO = -1, firstOp = -1
    for (let i = 0; i < N; i++) {
      if (c.renderOrders[i] !== a.renderOrders[i]) { no++; if (firstO < 0) firstO = i }
      if (Math.abs(c.opacities[i] - a.opacities[i]) > 1e-3) { nop++; if (firstOp < 0) firstOp = i }
    }
    if (no || nop) {
      console.log(`frame ${f}: order mismatch ${no}, opacity mismatch ${nop}`)
      if (firstO >= 0) {
        const byC = Array.from({ length: N }, (_, i) => i).sort((x, y) => c.renderOrders[x] - c.renderOrders[y])
        const byA = Array.from({ length: N }, (_, i) => i).sort((x, y) => a.renderOrders[x] - a.renderOrders[y])
        let k = 0; while (byC[k] === byA[k]) k++
        console.log('  first divergence at slot', k, 'core', byC.slice(k, k + 4).map((i) => `${c.ids[i]}(do=${c.drawOrders[i]})`), 'ayg', byA.slice(k, k + 4).map((i) => `${a.ids[i]}(do=${a.drawOrders[i]})`))
      }
      if (firstOp >= 0) {
        const i = firstOp
        console.log(`  opacity ${c.ids[i]} part=${c.parentPartIndices[i]} core=${c.opacities[i]} ayg=${a.opacities[i]}`)
        const cv = cm.parameters.values, av = am.parameters.values
        for (let p = 0; p < cm.parameters.count; p++) {
          const keep = cv[p]
          cv[p] = av[p] = cm.parameters.defaultValues[p]
          cm.update(); am.update()
          if (Math.abs(c.opacities[i] - a.opacities[i]) < 1e-3) console.log(`  resolved by resetting ${cm.parameters.ids[p]} (was ${keep}, range ${mins[p]}..${maxs[p]})`)
          cv[p] = av[p] = keep
        }
        const po = Array.from(cm.parts.opacities).map((o, k) => [cm.parts.ids[k], o]).filter(([, o]) => o !== 1)
        console.log('  non-1 part opacities', JSON.stringify(po))
        process.exit(0)
      }
      if (++dbgCount > 2) process.exit(0)
    }
  }
  // Relative back-to-front order of the drawables that actually draw (what the renderer uses).
  {
    const vis = Array.from({ length: N }, (_, i) => i).filter((i) => (c.dynamicFlags[i] & 1) && c.opacities[i] > 0)
    const sc = [...vis].sort((x, y) => c.renderOrders[x] - c.renderOrders[y])
    const sa = [...vis].sort((x, y) => a.renderOrders[x] - a.renderOrders[y])
    if (sc.some((v, k) => v !== sa[k])) worst.visibleOrderFrames++
    if (Array.from(c.renderOrders).some((v, k) => v !== a.renderOrders[k])) worst.absoluteOrderFrames++
  }
  c.resetDynamicFlags()
  a.resetDynamicFlags()
}
const memAfter = am.drawables.vertexPositions[0].buffer.byteLength
console.log(`${frames} frames, ${N} drawables:`, JSON.stringify(worst))
console.log(`update(): facade ${(tA / frames).toFixed(3)} ms/frame, core ${(tC / frames).toFixed(3)} ms/frame`)
console.log(`wasm memory ${(memBefore / 1048576).toFixed(1)} -> ${(memAfter / 1048576).toFixed(1)} MiB (growth detaches views; facade re-creates them)`)
