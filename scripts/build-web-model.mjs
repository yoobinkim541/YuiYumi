#!/usr/bin/env node
// Builds encrypted web packs of the Live2D models: public/models/<id>.bin, plus a
// plaintext icon (public/models/<id>-icon.png) for the 2D fallback sprite.
//
// Each pack is a zip holding:
// - <name>.model3.json with relative paths: textures, moc3, physics, cdi, exp3
//   (renamed to ASCII; Expressions[].Name keeps the NFC-normalized original name),
//   one motion group per motion name plus `Idle`;
// - textures downscaled to 4096 px;
// - motions: with an anim-graph.json, only those its nodes reference plus the profile
//   idle motion and the extra reaction motions; otherwise every motion3 under motions/;
// - ambient loops: profile [[ambient]], else the vtube.json IdleAnimation;
// - profile.json (model_name, idle_motion, ambient, expressions, mutex_groups, emotions)
//   and anim-graph.json when present.
// The zip is encrypted with AES-256-GCM: file = 12-byte IV || ciphertext || 16-byte tag.
// Key: MODEL_ASSET_KEY (base64, 32 bytes) from the environment or .env.local.
//
// Usage: pnpm model [id ...]   (default: all models below)

import { createCipheriv, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import sharp from 'sharp'
import { parse as parseToml } from 'smol-toml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'public/models')
const TEXTURE_SIZE = 4096

const MODELS = [
  {
    id: 'tt2',
    src: 'models/TT2.0',
    // Idle body motion shared with the Yui model (standard parameters only).
    defaultIdle: 'taptc-ri-idle-35a-eye-smile',
    extraMotions: [],
    extraMotionFiles: ['models/Yui/motions/authored/taptc-ri-idle-35a-eye-smile.motion3.json'],
  },
  {
    id: 'yui',
    src: 'models/Yui',
    defaultIdle: null,
    // Reaction motions used by the yui entry of src/character/models.ts.
    extraMotions: [
      'sekai-cute-nbglad02-face-smile',
      'sekai-happy-guruguru01',
      'arch-nyarchlinux-arch-thinking',
      '2-0-tt2-0-questionmotion',
      '2-0-tt2-0-sadmotion',
      '2-0-tt2-0-smileidle1',
      'holodreams-question-01-lv03',
      'holodreams-notice-01-lv01-face-surprise',
      'holodreams-shy-01-lv03-face-shy',
      'sekai-cute-fidget01-face-shy',
    ],
  },
]

const MOTION_SUFFIX = '.motion3.json'
const EXP_SUFFIX = '.exp3.json'

async function exists(p) {
  try { await stat(p); return true }
  catch { return false }
}

async function walk(dir, out = []) {
  if (!(await exists(dir))) return out
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

const readJson = async p => JSON.parse(await readFile(p, 'utf8'))
const json = v => `${JSON.stringify(v, null, 2)}\n`
const safeName = name => name.normalize('NFC').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'x'

async function loadKey() {
  let b64 = process.env.MODEL_ASSET_KEY
  if (!b64) {
    for (const f of ['.env.local', '.env']) {
      const p = join(root, f)
      if (!(await exists(p))) continue
      const m = (await readFile(p, 'utf8')).match(/^\s*MODEL_ASSET_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/m)
      if (m) { b64 = m[1]; break }
    }
  }
  if (!b64) throw new Error('MODEL_ASSET_KEY is not set (environment or .env.local)')
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error(`MODEL_ASSET_KEY must be 32 bytes base64, got ${key.length} bytes`)
  return key
}

function encrypt(key, plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()])
}

async function buildModel(def, key) {
  const t0 = Date.now()
  const SRC = resolve(root, def.src)
  const files = await readdir(SRC)
  const model3Name = files.filter(f => f.endsWith('.model3.json')).sort()[0]
  if (!model3Name) throw new Error(`no *.model3.json in ${SRC}`)
  const model3 = await readJson(join(SRC, model3Name))
  const vtubeName = files.find(f => f.endsWith('.vtube.json'))
  const vtube = vtubeName ? await readJson(join(SRC, vtubeName)) : null
  const tomlPath = join(SRC, 'yuiyumi.toml')
  // NFC: macOS file names may be NFD-decomposed while the profile is NFC.
  const toml = (await exists(tomlPath)) ? parseToml((await readFile(tomlPath, 'utf8')).normalize('NFC')) : {}
  const graphPath = join(SRC, 'anim-graph.json')
  const graph = (await exists(graphPath)) ? await readJson(graphPath) : null

  const zip = new JSZip()
  const add = async (zipPath, srcPath) => zip.file(zipPath, await readFile(srcPath))

  // --- Motion index (stem -> path)
  const motionIndex = new Map()
  for (const p of (await walk(join(SRC, 'motions'))).filter(f => f.endsWith(MOTION_SUFFIX)).sort()) {
    const stem = basename(p, MOTION_SUFFIX).normalize('NFC')
    if (!motionIndex.has(stem)) motionIndex.set(stem, p)
  }
  for (const rel of def.extraMotionFiles ?? []) {
    const p = resolve(root, rel)
    const stem = basename(p, MOTION_SUFFIX).normalize('NFC')
    if (!motionIndex.has(stem)) motionIndex.set(stem, p)
  }

  const idleMotion = toml.idle_motion ?? (def.defaultIdle && motionIndex.has(def.defaultIdle) ? def.defaultIdle : null)
  let wanted
  if (graph) {
    wanted = new Set(def.extraMotions)
    for (const node of graph.nodes ?? []) {
      for (const a of node.animations ?? []) if (a.type === 'motion' && a.name) wanted.add(a.name)
    }
    if (idleMotion) wanted.add(idleMotion)
  }
  else {
    wanted = new Set(motionIndex.keys())
  }

  const motionGroups = {}
  const missing = []
  for (const name of wanted) {
    const p = motionIndex.get(name)
    if (!p) { missing.push(name); continue }
    const file = `motions/${safeName(name)}${MOTION_SUFFIX}`
    await add(file, p)
    motionGroups[name] = [{ File: file, FadeInTime: 0.5, FadeOutTime: 0.5 }]
  }
  if (idleMotion && motionGroups[idleMotion]) motionGroups.Idle = [{ ...motionGroups[idleMotion][0] }]

  // --- Ambient loops (played by the runtime, not through the SDK motion manager)
  const ambientSrc = toml.ambient
    ?? (vtube?.FileReferences?.IdleAnimation ? [{ motion: vtube.FileReferences.IdleAnimation }] : [])
  const ambient = []
  for (const [i, a] of ambientSrc.entries()) {
    const src = a.motion.endsWith(MOTION_SUFFIX) ? join(SRC, a.motion) : motionIndex.get(a.motion)
    if (!src || !(await exists(src))) { missing.push(a.motion); continue }
    const file = `motions/ambient-${i}-${safeName(basename(src, MOTION_SUFFIX))}${MOTION_SUFFIX}`
    await add(file, src)
    ambient.push({ motion: file, ...(a.gate ? { gate: a.gate } : {}) })
  }

  // --- Expressions: every exp3 in the model root
  const expressions = []
  for (const [i, f] of files.filter(f => f.endsWith(EXP_SUFFIX)).sort().entries()) {
    const file = `expressions/e${String(i).padStart(2, '0')}${EXP_SUFFIX}`
    await add(file, join(SRC, f))
    expressions.push({ Name: basename(f, EXP_SUFFIX).normalize('NFC'), File: file })
  }
  for (const [i, x] of (def.extraExpressions ?? []).entries()) {
    const file = `expressions/x${String(i).padStart(2, '0')}${EXP_SUFFIX}`
    zip.file(file, json({ Type: 'Live2D Expression', Parameters: x.params }))
    expressions.push({ Name: x.name.normalize('NFC'), File: file })
  }
  const profileExpressions = { ...(toml.expressions ?? {}) }
  for (const x of def.extraExpressions ?? []) profileExpressions[x.name.normalize('NFC')] = x.profile
  const mutexGroups = { ...(toml.mutex_groups ?? {}) }
  for (const [g, names] of Object.entries(def.mutexAdd ?? {})) mutexGroups[g] = [...(mutexGroups[g] ?? []), ...names]

  // --- Static files
  const refs = model3.FileReferences
  for (const k of ['Moc', 'Physics', 'DisplayInfo']) {
    if (refs[k]) await add(basename(refs[k]), join(SRC, refs[k]))
  }
  if (graph) zip.file('anim-graph.json', json(graph))

  // --- Textures
  const textures = await Promise.all(refs.Textures.map(async (tex, i) => {
    const file = `textures/texture_${String(i).padStart(2, '0')}.png`
    const img = sharp(join(SRC, tex))
    const { width = TEXTURE_SIZE } = await img.metadata()
    const size = Math.min(width, TEXTURE_SIZE)
    zip.file(file, await img.resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toBuffer())
    return file
  }))

  zip.file(model3Name, json({
    Version: 3,
    FileReferences: {
      Moc: basename(refs.Moc),
      Textures: textures,
      ...(refs.Physics ? { Physics: basename(refs.Physics) } : {}),
      ...(refs.DisplayInfo ? { DisplayInfo: basename(refs.DisplayInfo) } : {}),
      Expressions: expressions,
      Motions: motionGroups,
    },
    Groups: model3.Groups ?? [],
    ...(model3.HitAreas ? { HitAreas: model3.HitAreas } : {}),
  }))
  zip.file('profile.json', json({
    model_name: toml.model_name ?? basename(model3Name, '.model3.json'),
    idle_motion: idleMotion,
    ambient,
    expressions: profileExpressions,
    mutex_groups: mutexGroups,
    emotions: { ...(toml.emotions ?? {}), ...(def.emotionOverrides ?? {}) },
  }))

  // PNG and moc3 barely compress; STORE keeps unzip fast in the browser.
  const plain = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  await writeFile(join(OUT, `${def.id}.bin`), encrypt(key, plain))

  const icon = vtube?.FileReferences?.Icon ?? files.find(f => /icon.*\.png$/i.test(f))
  if (icon && (await exists(join(SRC, icon)))) await copyFile(join(SRC, icon), join(OUT, `${def.id}-icon.png`))
  else console.warn(`[model:${def.id}] no icon; the 2D fallback will have no sprite`)

  console.log(`[model:${def.id}] ${model3Name}: ${Object.keys(motionGroups).length} motion groups, ${ambient.length} ambient, ${expressions.length} expressions, ${textures.length} textures; ${(plain.length / 1e6).toFixed(1)} MB -> ${def.id}.bin in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (missing.length) console.warn(`[model:${def.id}] motions not found: ${missing.join(', ')}`)
}

async function main() {
  const key = await loadKey()
  const ids = process.argv.slice(2)
  const selected = ids.length ? MODELS.filter(m => ids.includes(m.id)) : MODELS
  if (!selected.length) throw new Error(`unknown model id(s): ${ids.join(', ')}`)
  await mkdir(OUT, { recursive: true })
  // No plaintext model directory may remain under public/models.
  for (const entry of await readdir(OUT, { withFileTypes: true })) {
    if (entry.isDirectory()) await rm(join(OUT, entry.name), { recursive: true, force: true })
  }
  for (const def of selected) {
    if (!(await exists(resolve(root, def.src)))) { console.warn(`[model:${def.id}] source missing: ${def.src}; skipped`); continue }
    await buildModel(def, key)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
