// Wire protocol between the local agent runtime and the desktop app (agent-bridge.ts).
// Self-contained on purpose (no imports): the browser bundle imports this file directly.

export const TOKEN_HEADER = 'x-yuiyumi-agent-token'

export type AgentLang = 'en' | 'ja' | 'ko' | 'zh-Hans' | 'zh-Hant'
/** Same levels as settings.permission in the web app. */
export type AgentPermissionLevel = 'manual' | 'auto' | 'bypass'
/** Task model chosen in settings (settings.agentModel); the runtime maps it to a model id. */
export type AgentModelChoice = 'sonnet' | 'opus'
/** What a tool call can do, for the permission policy and the panel icons. */
export type ToolGrade = 'read' | 'write' | 'shell' | 'network' | 'outbound'

export interface AgentPersona {
  name: string
  speakingStyle?: string
}

/** POST /sessions */
export interface StartTaskRequest {
  text: string
  /** Absolute project folder. Falls back to the runtime's configured project folder. */
  cwd?: string
  lang?: AgentLang
  persona?: AgentPersona
  permission?: AgentPermissionLevel
  model?: AgentModelChoice
  /** Resume an earlier session (its id) instead of starting a new one. */
  resume?: string
}
export interface StartTaskResponse { sessionId: string, cwd: string, model: string }

/** POST /sessions/:id/messages */
export interface FollowUpRequest { text: string }
/** POST /sessions/:id/permissions/:requestId */
export interface PermissionAnswer { allow: boolean }
/** POST /sessions/:id/settings */
/** Applies from the next model call on. */
export interface SessionSettings { permission?: AgentPermissionLevel, model?: AgentModelChoice }

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Events streamed on GET /sessions/:id/events (SSE, `data:` is one JSON event). */
export type AgentEvent =
  | { type: 'session', sessionId: string, cwd: string, model: string, tools: string[] }
  | { type: 'status', state: 'running' | 'idle' | 'closed' }
  /** A follow-up or the first request, echoed so every client sees the same transcript. */
  | { type: 'user', text: string }
  /** Assistant text for the transcript. `say` lines are already removed from `text`. */
  | { type: 'text', text: string, say?: string[], parentId?: string }
  /** One-sentence spoken summary: `start` when work begins, `end` with the result. */
  | { type: 'speak', phase: 'start' | 'end', text: string }
  | { type: 'tool_start', id: string, name: string, grade: ToolGrade, summary: string, parentId?: string }
  | { type: 'tool_end', id: string, ok: boolean, output?: string }
  | { type: 'permission', requestId: string, toolUseId: string, tool: string, grade: ToolGrade, summary: string, title?: string, expiresAt: number }
  | { type: 'permission_resolved', requestId: string, allow: boolean, reason: 'user' | 'policy' | 'timeout' | 'cancel' }
  | { type: 'notice', text: string }
  | { type: 'result', ok: boolean, text: string, subtype: string, costUsd: number, durationMs: number, turns: number, usage: AgentUsage }
  | { type: 'error', code: AgentErrorCode, message: string }

export type AgentErrorCode = 'bad_request' | 'unauthorized' | 'not_found' | 'no_project' | 'unconfigured' | 'budget' | 'sdk' | 'internal'

export interface SequencedEvent { seq: number, event: AgentEvent }

// ---------------------------------------------------------------------------
// SSE framing

/** One SSE frame for an event. Data is single-line JSON, so one `data:` line suffices. */
export function encodeSse(seq: number, event: AgentEvent): string {
  return `id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Incremental SSE parser: feed decoded text chunks as they arrive, get complete events.
 * Handles frames split across chunks, CRLF line ends, comments (keepalives) and
 * multi-line `data:`. Frames without data or with unparsable JSON are skipped.
 */
export class SseParser {
  private buf = ''
  private data: string[] = []
  private id: string | null = null

  feed(chunk: string): SequencedEvent[] {
    this.buf += chunk
    const out: SequencedEvent[] = []
    let nl: number
    while ((nl = this.buf.search(/\r\n|\n|\r/)) >= 0) {
      const line = this.buf.slice(0, nl)
      // A lone trailing \r may be the first half of \r\n: wait for the next chunk.
      if (this.buf[nl] === '\r' && nl === this.buf.length - 1) break
      this.buf = this.buf.slice(nl + (this.buf.startsWith('\r\n', nl) ? 2 : 1))
      if (line === '') {
        const ev = this.dispatch()
        if (ev) out.push(ev)
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      let value = colon < 0 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'data') this.data.push(value)
      else if (field === 'id') this.id = value
    }
    return out
  }

  private dispatch(): SequencedEvent | null {
    const data = this.data.join('\n')
    const id = this.id
    this.data = []
    this.id = null
    if (!data) return null
    try {
      const event = JSON.parse(data) as AgentEvent
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') return null
      return { seq: id !== null && /^\d+$/.test(id) ? Number(id) : -1, event }
    } catch {
      return null
    }
  }
}
