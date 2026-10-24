#!/usr/bin/env node
// Places Live2D Cubism Core at public/vendor/live2dcubismcore.min.js.
// Cubism Core is licensed separately by Live2D and is not tracked in git.
//
// Sources, in order:
//   CUBISM_CORE_PATH  local path to live2dcubismcore.min.js (e.g. from CubismSdkForWeb-5-r.*/Core/)
//   CUBISM_CORE_URL   URL to download it from
//
// Usage: CUBISM_CORE_PATH=/path/to/live2dcubismcore.min.js node scripts/fetch-cubism-core.mjs

import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'public/vendor/live2dcubismcore.min.js')

async function main() {
  await mkdir(dirname(target), { recursive: true })
  const path = process.env.CUBISM_CORE_PATH
  const url = process.env.CUBISM_CORE_URL

  if (path) {
    await copyFile(resolve(path), target)
  }
  else if (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
    await writeFile(target, Buffer.from(await res.arrayBuffer()))
  }
  else {
    try {
      await stat(target)
      console.log(`[cubism-core] already present: ${target}`)
      return
    }
    catch {
      throw new Error('Set CUBISM_CORE_PATH or CUBISM_CORE_URL to provide live2dcubismcore.min.js')
    }
  }
  const { size } = await stat(target)
  if (size < 10_000) throw new Error(`[cubism-core] file too small (${size} bytes); not a Cubism Core build?`)
  console.log(`[cubism-core] wrote ${target} (${size} bytes)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
