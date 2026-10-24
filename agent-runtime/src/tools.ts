// Tool grading, the permission policy (settings.permission -> allow / ask) and the short
// one-line summaries shown on tool steps and permission prompts.

import path from 'node:path'
import type { AgentPermissionLevel, ToolGrade } from './protocol.ts'

/** Claude Code built-in tools by what they can do. Anything not listed is `outbound`. */
const GRADES: Record<string, ToolGrade> = {
  Read: 'read', Glob: 'read', Grep: 'read', LS: 'read', NotebookRead: 'read',
  TodoWrite: 'read', ToolSearch: 'read', ExitPlanMode: 'read', EnterPlanMode: 'read',
  // Hosted search runs on Anthropic's side and sends only the query.
  WebSearch: 'read',
  // A subagent's own tool calls go through the same policy one by one.
  Agent: 'read', Task: 'read', TaskOutput: 'read', Skill: 'read',
  // Reading or stopping a background shell the agent itself started.
  BashOutput: 'read', KillShell: 'read', KillBash: 'read', TaskStop: 'read',
  Write: 'write', Edit: 'write', MultiEdit: 'write', NotebookEdit: 'write',
  Bash: 'shell', PowerShell: 'shell',
  WebFetch: 'network',
}

export function gradeTool(name: string): ToolGrade {
  return GRADES[name] ?? 'outbound'
}

/** Paths a tool call touches, for the project-folder check. */
function pathsOf(name: string, input: Record<string, unknown>): string[] {
  const keys = name === 'Glob' || name === 'Grep' ? ['path'] : ['file_path', 'notebook_path', 'path']
  return keys.map(k => input[k]).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

export function isInside(root: string, p: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(root, p))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export interface PolicyInput {
  level: AgentPermissionLevel
  tool: string
  input: Record<string, unknown>
  cwd: string
  /** Set by the SDK when the call reaches outside the allowed directories. */
  blockedPath?: string
}

/**
 * manual: ask before any write, shell, network or outbound tool.
 * auto:   ask only for shell commands and outbound tools (MCP, unknown), and for writes
 *         outside the project folder.
 * bypass: never ask.
 * Read-only tools never ask inside the project folder; reaching outside it asks unless bypass.
 */
export function decidePermission(p: PolicyInput): 'allow' | 'ask' {
  if (p.level === 'bypass') return 'allow'
  const grade = gradeTool(p.tool)
  const outside = Boolean(p.blockedPath) || pathsOf(p.tool, p.input).some(f => !isInside(p.cwd, f))
  switch (grade) {
    case 'read': return outside ? 'ask' : 'allow'
    case 'write': return p.level === 'auto' && !outside ? 'allow' : 'ask'
    case 'network': return p.level === 'auto' ? 'allow' : 'ask'
    case 'shell':
    case 'outbound': return 'ask'
  }
}

// ---------------------------------------------------------------------------
// Summaries

export function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function rel(cwd: string, p: unknown): string {
  if (typeof p !== 'string') return ''
  const r = path.relative(cwd, path.resolve(cwd, p))
  return r && !r.startsWith('..') ? r : p
}

/** One line describing a tool call: the command, the file, the pattern, the URL. */
export function summarizeTool(name: string, input: Record<string, unknown>, cwd: string): string {
  const s = (k: string) => (typeof input[k] === 'string' ? input[k] as string : '')
  switch (name) {
    case 'Bash':
    case 'PowerShell': return clip(s('description') ? `${s('description')}: ${s('command')}` : s('command'), 160)
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit': return rel(cwd, input.file_path)
    case 'NotebookEdit': return rel(cwd, input.notebook_path)
    case 'Glob': return clip(`${s('pattern')}${input.path ? ` in ${rel(cwd, input.path)}` : ''}`, 160)
    case 'Grep': return clip(`"${s('pattern')}"${input.path ? ` in ${rel(cwd, input.path)}` : ''}`, 160)
    case 'WebFetch': return clip(s('url'), 160)
    case 'WebSearch': return clip(s('query'), 160)
    case 'Agent':
    case 'Task': return clip(s('description') || s('prompt'), 160)
    case 'TodoWrite': return Array.isArray(input.todos) ? `${input.todos.length} items` : ''
    default: {
      const first = Object.entries(input).find(([, v]) => typeof v === 'string')
      return first ? clip(`${first[0]}: ${first[1] as string}`, 160) : ''
    }
  }
}

/** Short excerpt of a tool result for the collapsible step. */
export function summarizeResult(content: unknown): string {
  let text = ''
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content.map(b => (b && typeof b === 'object' && (b as { type?: string }).type === 'text' ? (b as { text: string }).text : '')).join('\n')
  }
  text = text.trim()
  return text.length > 600 ? `${text.slice(0, 599)}…` : text
}
