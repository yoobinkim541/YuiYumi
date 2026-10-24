// pnpm desktop:build: app icons from the web icon when present, then `tauri build` (.app + .dmg).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })

run('node', [join(root, 'src-tauri', 'scripts', 'icons.mjs')])
const override = join(root, 'src-tauri', 'tauri.icons.conf.json')
run('pnpm', ['exec', 'tauri', 'build', ...(existsSync(override) ? ['--config', override] : []), ...process.argv.slice(2)])
