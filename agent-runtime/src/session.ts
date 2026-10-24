// One agent session: a long-lived Claude Agent SDK query() in streaming-input mode, so
// follow-ups go into the same conversation and a running turn can be interrupted. SDK
// messages are translated into the AgentEvent stream; permission prompts wait for the UI.

import { randomUUID } from 'node:crypto'
import { query, type CanUseTool, type PermissionResult, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { childEnv, type Credentials, type RuntimeConfig } from './config.ts'
import { extractSay, firstSentence, voiceAppendix } from './prompt.ts'
import type { AgentEvent, AgentLang, AgentModelChoice, AgentPermissionLevel, AgentPersona, SequencedEvent } from './protocol.ts'
import { decidePermission, gradeTool, summarizeResult, summarizeTool } from './tools.ts'

/** Events kept for late subscribers and reconnects. */
const BUFFER = 2000

/** Async iterable the SDK reads user messages from; stays open between turns. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private ended = false

  push(m: SDKUserMessage): void {
    if (this.ended) return
    const w = this.waiters.shift()
    if (w) w({ value: m, done: false })
    else this.items.push(m)
  }

  end(): void {
    this.ended = true
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const m = this.items.shift()
        if (m) return Promise.resolve({ value: m, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise(resolve => this.waiters.push(resolve))
      },
    }
  }
}

interface PendingAsk {
  resolve: (r: PermissionResult) => void
  toolUseId: string
  timer: ReturnType<typeof setTimeout>
}

export interface SessionInit {
  cfg: RuntimeConfig
  cred: Credentials
  cwd: string
  lang: AgentLang
  persona?: AgentPersona
  permission: AgentPermissionLevel
  model: AgentModelChoice
  resume?: string
  /** Called once when the SDK reports an authentication failure (proxy token rejected). */
  onAuthFailure?: () => void
  /** Test seam: replaces the SDK's query(). */
  queryFn?: typeof query
}

export class AgentSession {
  readonly id: string
  readonly cwd: string
  model: string
  level: AgentPermissionLevel
  state: 'running' | 'idle' | 'closed' = 'idle'
  lastActivity = Date.now()

  private readonly init: SessionInit
  private readonly input = new InputQueue()
  private readonly abort = new AbortController()
  private q: Query | null = null
  private events: SequencedEvent[] = []
  private seq = 0
  private listeners = new Set<(e: SequencedEvent) => void>()
  private pending = new Map<string, PendingAsk>()
  /**
   * Spoken lines of the running turn. A SAY line is held until the turn uses a tool (then
   * it is the `start` line) or ends (then it is the `end` line), so a one-message answer
   * is not announced as a start.
   */
  private turn = { spokeStart: '', heldSay: '', cancelled: false }
  private sawInit = false

  constructor(init: SessionInit) {
    this.init = init
    this.id = init.resume ?? randomUUID()
    this.cwd = init.cwd
    this.model = init.cfg.models[init.model]
    this.level = init.permission
  }

  // --- event stream -------------------------------------------------------

  private emit(event: AgentEvent): void {
    const s = { seq: ++this.seq, event }
    this.events.push(s)
    if (this.events.length > BUFFER) this.events.splice(0, this.events.length - BUFFER)
    for (const fn of this.listeners) {
      try { fn(s) } catch { /* a broken listener must not stop the session */ }
    }
  }

  /** Replays buffered events after `after`, then streams new ones. Returns unsubscribe. */
  subscribe(after: number, fn: (e: SequencedEvent) => void): () => void {
    for (const e of this.events) if (e.seq > after) fn(e)
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private setState(state: 'running' | 'idle' | 'closed'): void {
    if (this.state === state) return
    this.state = state
    this.emit({ type: 'status', state })
  }

  // --- lifecycle -----------------------------------------------------------

  start(text: string): void {
    const { cfg, cred } = this.init
    const run = this.init.queryFn ?? query
    this.q = run({
      prompt: this.input,
      options: {
        cwd: this.cwd,
        model: this.model,
        effort: cfg.effort,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: voiceAppendix({ lang: this.init.lang, persona: this.init.persona }) },
        tools: { type: 'preset', preset: 'claude_code' },
        // Questions go into the spoken summary instead of a terminal picker.
        disallowedTools: ['AskUserQuestion'],
        permissionMode: 'default',
        canUseTool: this.canUseTool,
        // No filesystem settings: a project's .claude/settings.json could pre-allow tools
        // or run hooks. The appendix tells the agent to read CLAUDE.md / AGENTS.md itself.
        settingSources: [],
        env: childEnv(cfg, cred, this.model),
        abortController: this.abort,
        maxBudgetUsd: cfg.maxBudgetUsd,
        ...(this.init.resume ? { resume: this.init.resume } : { sessionId: this.id }),
      },
    })
    void this.pump()
    this.send(text)
  }

  send(text: string): void {
    if (this.state === 'closed') return
    this.lastActivity = Date.now()
    if (this.state === 'idle') this.turn = { spokeStart: '', heldSay: '', cancelled: false }
    this.emit({ type: 'user', text })
    this.setState('running')
    this.input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
  }

  /** Stops the running turn; the session stays open for follow-ups. */
  async cancel(): Promise<void> {
    if (this.state !== 'running') return
    this.turn.cancelled = true
    this.denyAll('cancel')
    try { await this.q?.interrupt() } catch (e) {
      this.emit({ type: 'notice', text: `interrupt failed: ${(e as Error).message}` })
    }
  }

  close(): void {
    if (this.state === 'closed') return
    this.denyAll('cancel')
    this.input.end()
    this.abort.abort()
    this.setState('closed')
  }

  setPermission(level: AgentPermissionLevel): void {
    this.level = level
  }

  async setModel(choice: AgentModelChoice): Promise<void> {
    const id = this.init.cfg.models[choice]
    if (id === this.model) return
    await this.q?.setModel(id)
    this.model = id
  }

  // --- permissions ---------------------------------------------------------

  private canUseTool: CanUseTool = async (toolName, input, opts) => {
    const decision = decidePermission({ level: this.level, tool: toolName, input, cwd: this.cwd, blockedPath: opts.blockedPath })
    if (decision === 'allow') return { behavior: 'allow', updatedInput: input, toolUseID: opts.toolUseID }
    if (opts.signal.aborted) return { behavior: 'deny', message: 'Cancelled.', toolUseID: opts.toolUseID }

    const requestId = randomUUID()
    const expiresAt = Date.now() + this.init.cfg.permissionTimeoutMs
    return new Promise<PermissionResult>((resolve) => {
      const timer = setTimeout(() => this.resolveAsk(requestId, false, 'timeout'), this.init.cfg.permissionTimeoutMs)
      this.pending.set(requestId, { resolve, toolUseId: opts.toolUseID, timer })
      opts.signal.addEventListener('abort', () => this.resolveAsk(requestId, false, 'cancel'), { once: true })
      this.emit({
        type: 'permission',
        requestId,
        toolUseId: opts.toolUseID,
        tool: toolName,
        grade: gradeTool(toolName),
        summary: summarizeTool(toolName, input, this.cwd),
        ...(opts.title ? { title: opts.title } : {}),
        expiresAt,
      })
    })
  }

  /** The UI's answer. False when the request is unknown or already resolved. */
  answer(requestId: string, allow: boolean): boolean {
    this.lastActivity = Date.now()
    return this.resolveAsk(requestId, allow, 'user')
  }

  private resolveAsk(requestId: string, allow: boolean, reason: 'user' | 'timeout' | 'cancel'): boolean {
    const p = this.pending.get(requestId)
    if (!p) return false
    this.pending.delete(requestId)
    clearTimeout(p.timer)
    const message = reason === 'timeout'
      ? 'The user did not answer the permission prompt in time, so this action was not run.'
      : reason === 'cancel' ? 'The user stopped the task.' : 'The user declined this action.'
    p.resolve(allow
      ? { behavior: 'allow', toolUseID: p.toolUseId, decisionClassification: 'user_temporary' }
      : { behavior: 'deny', message, toolUseID: p.toolUseId, decisionClassification: 'user_reject' })
    this.emit({ type: 'permission_resolved', requestId, allow, reason })
    return true
  }

  private denyAll(reason: 'cancel'): void {
    for (const id of [...this.pending.keys()]) this.resolveAsk(id, false, reason)
  }

  // --- SDK messages -> events ---------------------------------------------

  private async pump(): Promise<void> {
    try {
      for await (const m of this.q!) this.handle(m)
      if (this.state !== 'closed') this.setState('closed')
    } catch (e) {
      if (this.state === 'closed') return
      this.emit({ type: 'error', code: 'sdk', message: (e as Error).message || 'agent process failed' })
      this.close()
    }
  }

  private releaseStart(): void {
    const line = this.turn.heldSay
    this.turn.heldSay = ''
    if (this.turn.spokeStart || !line) return
    this.turn.spokeStart = line
    this.emit({ type: 'speak', phase: 'start', text: line })
  }

  handle(m: SDKMessage): void {
    this.lastActivity = Date.now()
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init' && !this.sawInit) {
          this.sawInit = true
          this.emit({ type: 'session', sessionId: this.id, cwd: m.cwd, model: m.model, tools: m.tools })
        } else if (m.subtype === 'api_retry') {
          this.emit({ type: 'notice', text: `Model API retry ${m.attempt}/${m.max_retries}${m.error_status ? ` (HTTP ${m.error_status})` : ''}` })
        }
        return
      case 'assistant': {
        if (m.error === 'authentication_failed') this.init.onAuthFailure?.()
        const parentId = m.parent_tool_use_id ?? undefined
        for (const block of m.message.content) {
          if (block.type === 'text') {
            const { text, say } = extractSay(block.text)
            if (!parentId && say[0] && !this.turn.spokeStart && !this.turn.heldSay) this.turn.heldSay = say[0]
            if (text || say.length) this.emit({ type: 'text', text, ...(say.length ? { say } : {}), ...(parentId ? { parentId } : {}) })
          } else if (block.type === 'tool_use') {
            if (!parentId) this.releaseStart()
            const input = (block.input ?? {}) as Record<string, unknown>
            this.emit({ type: 'tool_start', id: block.id, name: block.name, grade: gradeTool(block.name), summary: summarizeTool(block.name, input, this.cwd), ...(parentId ? { parentId } : {}) })
          }
        }
        return
      }
      case 'user': {
        const content = m.message.content
        if (!Array.isArray(content)) return
        for (const block of content) {
          if (block.type === 'tool_result') {
            const output = summarizeResult(block.content)
            this.emit({ type: 'tool_end', id: block.tool_use_id, ok: !block.is_error, ...(output ? { output } : {}) })
          }
        }
        return
      }
      case 'result': {
        const success = m.subtype === 'success'
        const raw = success ? m.result : m.errors.join('\n')
        const ok = success && !m.is_error && !this.turn.cancelled
        const { text, say } = extractSay(raw ?? '')
        const end = say.length ? say[say.length - 1]! : this.turn.heldSay || (ok ? firstSentence(text) : '')
        this.turn.heldSay = ''
        if (end && end !== this.turn.spokeStart) this.emit({ type: 'speak', phase: 'end', text: end })
        this.emit({
          type: 'result',
          ok,
          text,
          subtype: this.turn.cancelled ? 'cancelled' : m.subtype,
          costUsd: m.total_cost_usd,
          durationMs: m.duration_ms,
          turns: m.num_turns,
          usage: {
            inputTokens: m.usage.input_tokens ?? 0,
            outputTokens: m.usage.output_tokens ?? 0,
            cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: m.usage.cache_creation_input_tokens ?? 0,
          },
        })
        const queued = 'queued_turn_count' in m ? m.queued_turn_count ?? 0 : 0
        if (queued > 0) this.turn = { spokeStart: '', heldSay: '', cancelled: false }
        else this.setState('idle')
        return
      }
      default:
    }
  }
}
