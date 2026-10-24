// Generates the built-in voice clips (src/voice/builtin-lines.ts) with ElevenLabs:
// public/voice/<character>/<lang>/<id>.mp3 plus public/voice/manifest.json, which records
// the text of every clip so the app only plays a clip that matches its current line.
//
//   pnpm voices            generate missing or changed clips
//   pnpm voices --force    regenerate everything
//   pnpm voices --only=tt2/ko --dry-run
//
// Model: eleven_v4. GET /v1/models lists it as the highest-quality model (eleven_v3 is the
// previous generation at the same cost). Side-by-side samples with both voices rendered the
// audio tags ([giggles], [laughs]) as sounds in both models, but eleven_v3 dropped or
// misread short words ("えっと" was skipped, "아이" became "하이" in a Deepgram check)
// while eleven_v4 kept every word; it is also the base of the live preset (eleven_v4_turbo),
// so prepared and live lines sound like the same voice.
//
// Keys and voice ids come from the environment or .env.local and are never printed.
// Clips are not committed (public/voice/ is git-ignored); they ship in the local
// `vercel build` output. Requires Node 23.6+ (imports the TypeScript table directly).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'voice')
const MANIFEST = join(OUT, 'manifest.json')
const MODEL = 'eleven_v4'
const OUTPUT_FORMAT = 'mp3_44100_128'
// A little livelier than the voice defaults; v4 ignores style and speaker boost.
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8 }
const CONCURRENCY = 3
const ISO639 = { 'en': 'en', 'ja': 'ja', 'ko': 'ko', 'zh-Hans': 'zh', 'zh-Hant': 'zh' }

const args = process.argv.slice(2)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const only = args.find(a => a.startsWith('--only='))?.slice('--only='.length)

function loadEnv() {
  const env = {}
  for (const name of ['.env', '.env.local']) {
    const file = join(ROOT, name)
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) }
}

const env = loadEnv()
const key = env.ELEVENLABS_API_KEY
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set (environment or .env.local).')
  process.exit(1)
}
const voiceOf = character => env[`ELEVENLABS_VOICE_${character.toUpperCase()}`]

const { allBuiltinLines, clipPath } = await import('../src/voice/builtin-lines.ts')

/** @type {{ model?: string, lines: Record<string, string> }} */
let manifest = { lines: {} }
try { manifest = { lines: {}, ...JSON.parse(readFileSync(MANIFEST, 'utf8')) } } catch { /* first run */ }

const all = allBuiltinLines()
const lines = all.filter(l => !only || `${l.character}/${l.lang}` === only || l.character === only)
const missingVoice = [...new Set(lines.map(l => l.character))].filter(c => !voiceOf(c))
if (missingVoice.length) {
  console.error(`No voice id for: ${missingVoice.map(c => `ELEVENLABS_VOICE_${c.toUpperCase()}`).join(', ')}`)
  process.exit(1)
}

const keyOf = l => `${l.character}/${l.lang}/${l.id}`
const todo = lines.filter(l => force || manifest.lines[keyOf(l)] !== l.text || !existsSync(join(ROOT, 'public', clipPath(l))))
const needChars = todo.reduce((n, l) => n + l.text.length, 0)

async function subscription() {
  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
  if (!res.ok) return null
  const s = await res.json()
  return { used: s.character_count, limit: s.character_limit }
}

const before = await subscription()
console.log(`${lines.length} lines, ${todo.length} to generate (${needChars} characters) with ${MODEL}.`)
if (before) console.log(`Credits: ${before.used} / ${before.limit} used, ${before.limit - before.used} left.`)
if (before && needChars > before.limit - before.used) {
  console.error('Not enough credits left for this run.')
  process.exit(1)
}
if (dryRun || todo.length === 0) process.exit(0)

async function synthesize(l) {
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceOf(l.character))}`)
  url.searchParams.set('output_format', OUTPUT_FORMAT)
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
      body: JSON.stringify({ text: l.text, model_id: MODEL, language_code: ISO639[l.lang], voice_settings: VOICE_SETTINGS }),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    const retry = res.status === 429 || res.status >= 500
    if (!retry || attempt >= 4) throw new Error(`${keyOf(l)}: HTTP ${res.status} ${(await res.text()).replaceAll(voiceOf(l.character), '<voice>').slice(0, 200)}`)
    await new Promise(r => setTimeout(r, 1500 * attempt))
  }
}

function saveManifest() {
  // Only lines still in the table and present on disk.
  const kept = {}
  for (const l of all) {
    const k = keyOf(l)
    if (manifest.lines[k] && existsSync(join(ROOT, 'public', clipPath(l)))) kept[k] = manifest.lines[k]
  }
  manifest = { model: MODEL, outputFormat: OUTPUT_FORMAT, generatedAt: new Date().toISOString(), lines: kept }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
}

let done = 0
let failed = 0
const queue = [...todo]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let l = queue.shift(); l; l = queue.shift()) {
    try {
      const audio = await synthesize(l)
      const file = join(ROOT, 'public', clipPath(l))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, audio)
      manifest.lines[keyOf(l)] = l.text
      done++
      if (done % 20 === 0) { saveManifest(); console.log(`  ${done}/${todo.length}`) }
    } catch (e) {
      failed++
      console.error(`  failed ${e instanceof Error ? e.message : e}`)
    }
  }
}))
saveManifest()

const after = await subscription()
console.log(`Generated ${done}, failed ${failed}.`)
if (before && after) console.log(`Credits used: ${after.used - before.used} (${after.used} / ${after.limit}).`)
process.exit(failed ? 1 : 0)
