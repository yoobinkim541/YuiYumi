// Runtime configuration (environment variables, set by the desktop app when it spawns the
// runtime) and the model credentials handed to the Claude Code process.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentModelChoice, AgentPermissionLevel } from './protocol.ts'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface RuntimeConfig {
  host: '127.0.0.1'
  /** 0 picks a free port. */
  port: number
  token: string
  /** True when the token was generated here (it is then printed on the ready line). */
  tokenGenerated: boolean
  /** Default project folder; requests may name another one. */
  projectDir?: string
  /** Runtime state: install token, Claude Code config and session transcripts. */
  stateDir: string
  /** Task model ids per user choice (settings.agentModel). */
  models: Record<AgentModelChoice, string>
  /** Small/background model Claude Code uses for titles and summaries. */
  smallModel: string
  effort: Effort
  defaultPermission: AgentPermissionLevel
  permissionTimeoutMs: number
  maxBudgetUsd: number
  /** Extra CORS origins (the desktop dev server); the Tauri origins are always allowed. */
  origins: string[]
  /** https://<app>/api/anthropic: model calls go through the YuiYumi proxy. */
  proxyUrl?: string
  installToken?: string
  exitOnStdinClose: boolean
}

const RESERVED_PORTS = new Set([5180])
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

function defaultStateDir(): string {
  const home = os.homedir()
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'YuiYumi', 'agent-runtime')
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'YuiYumi', 'agent-runtime')
  return path.join(process.env.XDG_STATE_HOME ?? path.join(home, '.local', 'state'), 'yuiyumi', 'agent-runtime')
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): RuntimeConfig {
  const v = (k: string) => (env[k] && env[k]!.length > 0 ? env[k] : undefined)
  const port = Number(v('YUIYUMI_AGENT_PORT') ?? 0)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('YUIYUMI_AGENT_PORT must be a port number')
  if (RESERVED_PORTS.has(port)) throw new Error(`port ${port} is reserved for the web dev server`)
  const given = v('YUIYUMI_AGENT_TOKEN')
  if (given && given.length < 24) throw new Error('YUIYUMI_AGENT_TOKEN must be at least 24 characters')
  const effort = (v('YUIYUMI_AGENT_EFFORT') ?? 'medium') as Effort
  const level = v('YUIYUMI_AGENT_PERMISSION') as AgentPermissionLevel | undefined
  return {
    host: '127.0.0.1',
    port,
    token: given ?? randomBytes(32).toString('base64url'),
    tokenGenerated: !given,
    projectDir: v('YUIYUMI_AGENT_PROJECT_DIR'),
    stateDir: v('YUIYUMI_AGENT_STATE_DIR') ?? defaultStateDir(),
    // Same variables and defaults as server/anthropic.ts MODELS.agent.
    models: { sonnet: v('MODEL_AGENT') ?? 'claude-sonnet-5-5', opus: v('MODEL_AGENT_OPUS') ?? 'claude-opus-5-5' },
    smallModel: v('MODEL_OBSERVER') ?? 'claude-haiku-5-5',
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    defaultPermission: level === 'auto' || level === 'bypass' ? level : 'manual',
    permissionTimeoutMs: Number(v('YUIYUMI_AGENT_PERMISSION_TIMEOUT_MS') ?? 120_000),
    maxBudgetUsd: Number(v('YUIYUMI_AGENT_MAX_BUDGET_USD') ?? 5),
    origins: (v('YUIYUMI_AGENT_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
    proxyUrl: v('YUIYUMI_AGENT_PROXY_URL')?.replace(/\/$/, ''),
    installToken: v('YUIYUMI_AGENT_INSTALL_TOKEN'),
    exitOnStdinClose: argv.includes('--exit-on-stdin-close'),
  }
}

// ---------------------------------------------------------------------------
// Project folder

/**
 * Resolves the working folder of a task. Never the home directory or a filesystem root:
 * the user picks a project folder in settings (or the request names one).
 */
export function resolveProjectDir(requested: string | undefined, cfg: RuntimeConfig): { ok: true, dir: string } | { ok: false, message: string } {
  const raw = requested ?? cfg.projectDir
  if (!raw) return { ok: false, message: 'No project folder is set. Choose one in settings.' }
  if (!path.isAbsolute(raw)) return { ok: false, message: 'The project folder must be an absolute path.' }
  const dir = path.resolve(raw)
  if (dir === path.parse(dir).root || dir === path.resolve(os.homedir())) {
    return { ok: false, message: 'Choose a project folder, not the whole home directory or disk.' }
  }
  try {
    if (!statSync(dir).isDirectory()) return { ok: false, message: 'The project folder is not a directory.' }
  } catch {
    return { ok: false, message: 'The project folder does not exist.' }
  }
  // Real path: tool calls report resolved paths (macOS /var is /private/var).
  return { ok: true, dir: realpathSync(dir) }
}

// ---------------------------------------------------------------------------
// Credentials

export type Credentials =
  | { mode: 'direct', apiKey: string }
  | { mode: 'proxy', baseUrl: string, installToken: string }

/** Direct key in development; the YuiYumi proxy otherwise. Null when neither is available. */
export async function resolveCredentials(cfg: RuntimeConfig, env: NodeJS.ProcessEnv = process.env): Promise<Credentials | null> {
  if (cfg.proxyUrl) {
    const installToken = cfg.installToken ?? await installTokenFor(cfg)
    return { mode: 'proxy', baseUrl: cfg.proxyUrl, installToken }
  }
  const key = env.ANTHROPIC_API_KEY
  return key ? { mode: 'direct', apiKey: key } : null
}

let minted: Promise<string> | null = null

/** Per-install token from the proxy, cached in the state folder (owner-only file). */
async function installTokenFor(cfg: RuntimeConfig): Promise<string> {
  const file = path.join(cfg.stateDir, 'install-token')
  if (existsSync(file)) {
    const t = readFileSync(file, 'utf8').trim()
    if (t) return t
  }
  minted ??= (async () => {
    const res = await fetch(`${cfg.proxyUrl}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (!res.ok) throw new Error(`install token request failed (${res.status})`)
    const { token } = await res.json() as { token?: string }
    if (!token) throw new Error('install token missing in proxy response')
    mkdirSync(cfg.stateDir, { recursive: true })
    writeFileSync(file, token, { mode: 0o600 })
    return token
  })().finally(() => { minted = null })
  return minted
}

/** Drops a cached install token the proxy rejected, so the next task mints a new one. */
export function forgetInstallToken(cfg: RuntimeConfig): void {
  const file = path.join(cfg.stateDir, 'install-token')
  try { writeFileSync(file, '', { mode: 0o600 }) } catch { /* not cached */ }
}

/**
 * Environment of the Claude Code process. Built from scratch, not inherited: the agent's
 * shell must not see unrelated secrets from the desktop app's environment.
 */
export function childEnv(cfg: RuntimeConfig, cred: Credentials, model: string, base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TERM', 'TZ', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ComSpec', 'PATHEXT']) {
    const val = base[k]
    if (val) out[k] = val
  }
  Object.assign(out, {
    // Separate config and transcripts: no user-level settings, MCP servers or logins.
    CLAUDE_CONFIG_DIR: path.join(cfg.stateDir, 'claude'),
    CLAUDE_AGENT_SDK_CLIENT_APP: 'yuiyumi-agent-runtime/0.1.0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    // Strip credentials from the environment of the agent's own shell commands.
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    // Every model alias resolves to an allowed model (the proxy rejects others);
    // subagents run on the task model.
    ANTHROPIC_DEFAULT_SONNET_MODEL: cfg.models.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: cfg.models.opus,
    ANTHROPIC_DEFAULT_FABLE_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: cfg.smallModel,
    ANTHROPIC_SMALL_FAST_MODEL: cfg.smallModel,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
  })
  if (cred.mode === 'direct') out.ANTHROPIC_API_KEY = cred.apiKey
  else {
    out.ANTHROPIC_BASE_URL = cred.baseUrl
    // Sent as x-api-key; the proxy swaps it for the real key.
    out.ANTHROPIC_API_KEY = cred.installToken
  }
  return out
}
