// Entry point. The desktop app spawns this process (Tauri sidecar or child process) and
// reads one JSON line from stdout: {"type":"ready","port":N[,"token":"..."]}. The token is
// printed only when the app did not pass YUIYUMI_AGENT_TOKEN itself. Logs go to stderr.

import { loadConfig } from './config.ts'
import { startServer } from './server.ts'

async function main() {
  const cfg = loadConfig()
  const rt = await startServer(cfg)
  const mode = cfg.proxyUrl ? 'proxy' : process.env.ANTHROPIC_API_KEY ? 'direct (development key)' : 'unconfigured'
  console.error(`[agent-runtime] listening on 127.0.0.1:${rt.port}, models ${cfg.models.sonnet} / ${cfg.models.opus}, credentials: ${mode}`)
  process.stdout.write(`${JSON.stringify({ type: 'ready', port: rt.port, ...(cfg.tokenGenerated ? { token: cfg.token } : {}) })}\n`)

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await rt.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  // A sidecar must not outlive the app: the parent's end of stdin closes when it exits.
  if (cfg.exitOnStdinClose) {
    process.stdin.on('end', stop)
    process.stdin.on('close', stop)
    process.stdin.resume()
  }
}

main().catch((e: unknown) => {
  console.error(`[agent-runtime] failed to start: ${(e as Error).message}`)
  process.exit(1)
})
