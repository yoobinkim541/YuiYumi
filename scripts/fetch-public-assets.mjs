// Fetches the built public assets (encrypted model packs, character core, built-in voice
// lines) from a deployment into public/ so a machine without the private model sources (CI)
// can package the desktop app. The VAD assets come from node_modules (copy-vad-assets.mjs).
//
// Usage: node scripts/fetch-public-assets.mjs https://yuiyumi.vercel.app

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!/^https:\/\//.test(base)) throw new Error('usage: fetch-public-assets.mjs <https deployment URL>')
const pub = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public')

async function get(path) {
  const res = await fetch(`${base}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const out = join(pub, path)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, buf)
  return buf
}

const fixed = ['models/tt2.bin', 'models/yui.bin', 'models/tt2-icon.png', 'models/yui-icon.png', 'vendor/ayagami.wasm', 'vendor/live2dcubismcore.min.js']
for (const p of fixed) await get(p)

// Voice clips: public/voice/<character>/<lang>/<id>.mp3, keyed "<character>/<lang>/<id>" in manifest.json.
const manifest = JSON.parse((await get('voice/manifest.json')).toString('utf8'))
const clips = Object.keys(manifest.lines ?? {}).map(k => `voice/${k}.mp3`)
let done = 0
for (let i = 0; i < clips.length; i += 16) {
  await Promise.all(clips.slice(i, i + 16).map(p => get(p).then(() => { done++ }).catch(e => console.warn('[assets]', e.message))))
}
console.log(`[assets] ${fixed.length} files and ${done}/${clips.length} voice clips from ${base}`)
