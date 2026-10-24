// Copies the Silero VAD runtime (vad-web UMD bundle, AudioWorklet, model) and the
// onnxruntime-web wasm runtime from node_modules into public/vad/, served at /vad/.
// The browser loads them with <script> tags (src/voice/vad.ts), so the CommonJS-only
// vad-web package never goes through the Vite dev transform.
//
// Usage: node scripts/copy-vad-assets.mjs

import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const outDir = join(root, 'public', 'vad')

const vadDist = dirname(require.resolve('@ricky0123/vad-web/package.json')) + '/dist'
// Resolve onnxruntime-web from vad-web's location so both use the same version.
const vadRequire = createRequire(join(vadDist, 'index.js'))
const ortDist = dirname(vadRequire.resolve('onnxruntime-web/wasm'))

const files = [
  [vadDist, 'bundle.min.js', 'vad.bundle.min.js'],
  [vadDist, 'vad.worklet.bundle.min.js'],
  [vadDist, 'silero_vad_v5.onnx'],
  [ortDist, 'ort.wasm.min.js'],
  [ortDist, 'ort-wasm-simd-threaded.mjs'],
  [ortDist, 'ort-wasm-simd-threaded.wasm'],
]

mkdirSync(outDir, { recursive: true })
for (const [dir, name, target = name] of files) {
  const src = join(dir, name)
  const dst = join(outDir, target)
  copyFileSync(src, dst)
  console.log(`copied ${target} (${(statSync(dst).size / 1024).toFixed(0)} KiB)`)
}
