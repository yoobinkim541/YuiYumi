// pnpm desktop:build: app icons from the web icon when present, the agent runtime bundle
// (agent-bundle.mjs: node, main.mjs, claude as Resources/agent-runtime/), then `tauri build`
// (.app + .dmg). YUIYUMI_AGENT_BUNDLE=0 builds without the agent runtime (the app then says
// the coding agent is not installed).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })

run('node', [join(root, 'src-tauri', 'scripts', 'icons.mjs')])
const configs = []
const override = join(root, 'src-tauri', 'tauri.icons.conf.json')
if (existsSync(override)) configs.push('--config', override)
if (process.env.YUIYUMI_AGENT_BUNDLE !== '0') {
  run('node', [join(root, 'src-tauri', 'scripts', 'agent-bundle.mjs')])
  // Paths are relative to src-tauri/. Files keep their own code signatures.
  const files = ['node', 'main.mjs', 'claude', 'LICENSE-node.txt', 'LICENSE-claude-agent-sdk.md']
  const resources = Object.fromEntries(files.map(f => [`target/agent-bundle/${f}`, `agent-runtime/${f}`]))
  configs.push('--config', JSON.stringify({ bundle: { resources } }))
}
run('pnpm', ['exec', 'tauri', 'build', ...configs, ...process.argv.slice(2)])
