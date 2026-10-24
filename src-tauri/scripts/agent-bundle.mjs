// Stages the agent runtime for the macOS app bundle in src-tauri/target/agent-bundle/:
//   main.mjs  agent-runtime bundled into one ES module (esbuild; SDK and zod included)
//   claude    the Agent SDK's Claude Code binary for this platform (signed by Anthropic)
//   node      the official Node.js binary (downloaded once, SHA-256 checked, cached)
// plus their license files. build.mjs adds them to the bundle as Resources/agent-runtime/.
// Nothing here is committed (src-tauri/target is ignored).
//
// NODE_VERSION overrides the pinned Node release; YUIYUMI_NODE_CACHE the download cache.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NODE_VERSION = process.env.NODE_VERSION ?? 'v24.22.1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtimeDir = join(root, 'agent-runtime')
const out = join(root, 'src-tauri', 'target', 'agent-bundle')
const arch = { arm64: 'arm64', x64: 'x64' }[process.arch]
if (process.platform !== 'darwin' || !arch) throw new Error(`agent bundle: macOS arm64/x64 only (got ${process.platform}-${process.arch})`)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const requireRt = createRequire(join(runtimeDir, 'package.json'))

// 1. Runtime as one ES module. CommonJS dependencies need require() in ESM output.
const esbuild = requireRt('esbuild')
await esbuild.build({
  entryPoints: [join(runtimeDir, 'src', 'main.ts')],
  outfile: join(out, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'external',
  banner: { js: "import { createRequire as __yyRequire } from 'node:module'; const require = __yyRequire(import.meta.url);" },
  logLevel: 'warning',
})

// 2. Claude Code binary from the SDK's platform package (an optional dependency of the SDK).
const sdkDir = dirname(requireRt.resolve('@anthropic-ai/claude-agent-sdk'))
const requireSdk = createRequire(join(sdkDir, 'package.json'))
const platformPkg = dirname(requireSdk.resolve(`@anthropic-ai/claude-agent-sdk-darwin-${arch}/package.json`))
copyFileSync(join(platformPkg, 'claude'), join(out, 'claude'))
chmodSync(join(out, 'claude'), 0o755)
copyFileSync(join(sdkDir, 'LICENSE.md'), join(out, 'LICENSE-claude-agent-sdk.md'))

// 3. Official Node.js binary (Homebrew's node links to shared libraries, so it cannot be copied).
const cache = process.env.YUIYUMI_NODE_CACHE ?? join(os.homedir(), '.cache', 'yuiyumi', 'node')
const name = `node-${NODE_VERSION}-darwin-${arch}`
const tarball = join(cache, `${name}.tar.gz`)
mkdirSync(cache, { recursive: true })
async function fetchOk(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`)
  return res
}
const sums = await (await fetchOk(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`)).text()
const expected = sums.split('\n').find(l => l.endsWith(`  ${name}.tar.gz`))?.split(/\s+/)[0]
if (!expected) throw new Error(`no checksum for ${name}.tar.gz`)
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')
if (!existsSync(tarball) || sha(tarball) !== expected) {
  console.log(`[agent-bundle] downloading ${name}`)
  writeFileSync(tarball, Buffer.from(await (await fetchOk(`https://nodejs.org/dist/${NODE_VERSION}/${name}.tar.gz`)).arrayBuffer()))
  if (sha(tarball) !== expected) throw new Error(`checksum mismatch for ${name}.tar.gz`)
}
const extract = join(cache, name)
rmSync(extract, { recursive: true, force: true })
execFileSync('tar', ['-xzf', tarball, '-C', cache, `${name}/bin/node`, `${name}/LICENSE`])
copyFileSync(join(extract, 'bin', 'node'), join(out, 'node'))
chmodSync(join(out, 'node'), 0o755)
copyFileSync(join(extract, 'LICENSE'), join(out, 'LICENSE-node.txt'))

// Smoke check: the bundled node loads the bundled runtime far enough to reject a bad port.
try {
  execFileSync(join(out, 'node'), [join(out, 'main.mjs')], { env: { YUIYUMI_AGENT_PORT: 'x' }, stdio: 'pipe' })
} catch (e) {
  if (!String(e.stderr).includes('YUIYUMI_AGENT_PORT must be a port number')) throw new Error(`bundled runtime failed to load: ${e.stderr}`)
}
console.log(`[agent-bundle] ${out}: main.mjs, claude, node ${NODE_VERSION}`)
