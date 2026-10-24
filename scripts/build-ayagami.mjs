#!/usr/bin/env node
// Builds the Ayagami Live2D core to wasm and places it at public/vendor/ayagami.wasm.
//
//   cargo build --release --target wasm32-unknown-unknown --lib   (in crates/ayagami-web)
//
// Usage: node scripts/build-ayagami.mjs [--no-build]
//   --no-build  only copy an existing build (e.g. when cargo is unavailable)

import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const crate = resolve(root, 'crates/ayagami-web')
const wasm = resolve(crate, 'target/wasm32-unknown-unknown/release/ayagami_web.wasm')
const target = resolve(root, 'public/vendor/ayagami.wasm')

async function main() {
  if (!process.argv.includes('--no-build')) {
    const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown', '--lib'], { cwd: crate, stdio: 'inherit' })
    if (r.error) throw new Error(`cargo failed to start: ${r.error.message} (install Rust and the wasm32-unknown-unknown target, or pass --no-build)`)
    if (r.status !== 0) throw new Error(`cargo build exited with ${r.status}`)
  }
  await stat(wasm).catch(() => { throw new Error(`no wasm build at ${wasm}`) })
  await mkdir(dirname(target), { recursive: true })
  await copyFile(wasm, target)
  const { size } = await stat(target)
  console.log(`[ayagami] wrote ${target} (${size} bytes)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
