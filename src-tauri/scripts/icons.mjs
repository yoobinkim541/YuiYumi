// Desktop icons. The committed set in src-tauri/icons is a neutral placeholder (no character
// art). When the web app icon (public/models/tt2-icon.png, shipped to the web, not in git) is
// present, the app icon is generated from it into src-tauri/icons/app (git-ignored) and
// tauri.icons.conf.json points the bundle at it. Run with --placeholder to rebuild the
// committed placeholder and tray icons.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const icons = join(root, 'src-tauri', 'icons')
const tauri = (...args) => execFileSync('pnpm', ['exec', 'tauri', ...args], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

const BUBBLE = 'M8 10h32a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H22l-9 8v-8H8a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z'

if (process.argv.includes('--placeholder')) {
  mkdirSync(icons, { recursive: true })
  const app = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c7"/><stop offset="1" stop-color="#8fb8ff"/></linearGradient></defs>
    <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
    <g transform="translate(232 250) scale(11.7)"><path d="${BUBBLE}" fill="#fff"/></g>
    <circle cx="420" cy="500" r="34" fill="#8a6fb0"/><circle cx="604" cy="500" r="34" fill="#8a6fb0"/></svg>`
  const src = join(icons, 'placeholder-1024.png')
  await sharp(Buffer.from(app)).png().toFile(src)
  tauri('icon', src, '-o', icons)
  rmSync(src)
  // Menu bar template icon: black on transparent, macOS tints it.
  const tray = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="${BUBBLE}" fill="#000"/>
    <circle cx="17" cy="23" r="3" fill="#fff"/><circle cx="31" cy="23" r="3" fill="#fff"/></svg>`
  await sharp(Buffer.from(tray)).resize(44, 44).png().toFile(join(icons, 'tray.png'))
  process.exit(0)
}

const webIcon = join(root, 'public', 'models', 'tt2-icon.png')
const override = join(root, 'src-tauri', 'tauri.icons.conf.json')
if (!existsSync(webIcon)) {
  rmSync(override, { force: true })
  console.log('[icons] web icon not found, using the placeholder icons')
  process.exit(0)
}
const out = join(icons, 'app')
mkdirSync(out, { recursive: true })
const square = join(out, 'source.png')
await sharp(webIcon).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(square)
tauri('icon', square, '-o', out)
const files = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.png'].map(f => `icons/app/${f}`)
writeFileSync(override, `${JSON.stringify({ bundle: { icon: files } }, null, 2)}\n`)
console.log('[icons] app icon generated from the web icon')
