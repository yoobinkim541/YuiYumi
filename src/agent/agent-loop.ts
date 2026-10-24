// Browser-side agent loop. The server does one model call per /api/agent request; this
// loop runs the tools, asks for confirmation as the permission level requires, and feeds
// results back.
// Pure over its dependencies so it can be tested with a fake fetch.

import { getOpSpec, requiresConfirmation, type AgentModel, type AgentStepRequest, type AgentStepResponse, type ApiError, type ConnectorGrade, type ConnectorOpName, type DelegateOrigin, type Emotion, type PermissionLevel, type Persona } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { BusEvents } from '@/core/bus'
import type { ToolOutcome } from '@/connectors/registry'
import type { ConfirmCardInput } from './confirm-queue'
import { buildWritePreview, type PreviewLookup } from './preview'
import { AGENT_STRINGS } from './strings'
import { apiUrl } from '@/core/api'

export const MAX_STEPS = 8
export const SUGGESTION_TIMEOUT_MS = 45_000
const MAX_TOOL_RESULT_CHARS = 12_000
export const DECLINED_RESULT = 'The user declined; nothing was saved or sent.'

// ---------------------------------------------------------------------------
// Transport

export class AgentStepError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiError['code']) { super(message) }
}

export function createStepClient(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return async (req: AgentStepRequest): Promise<AgentStepResponse> => {
    const res = await fetchImpl(apiUrl('/api/agent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    const data = await res.json().catch(() => null) as unknown
    if (!res.ok) {
      const err = (data ?? {}) as Partial<ApiError>
      throw new AgentStepError(err.error ?? `HTTP ${res.status}`, res.status, err.code)
    }
    const body = data as Partial<AgentStepResponse> | null
    if (!body || !Array.isArray(body.content)) throw new AgentStepError('malformed agent response', res.status, 'provider')
    return { content: body.content, stopReason: body.stopReason ?? null }
  }
}

// ---------------------------------------------------------------------------
// Dependencies

type Emit = <K extends keyof BusEvents>(type: K, payload: BusEvents[K]) => void

/**
 * Shows tool work on the virtual desktop (focus the app, slide the avatar aside, type into
 * the composer, reveal the result). Optional; every hook may be a no-op.
 */
export interface Actuator {
  before: (op: ConnectorOpName, input: Record<string, unknown>, grade: ConnectorGrade) => Promise<void>
  after: (op: ConnectorOpName, input: Record<string, unknown>, outcome: ToolOutcome | null) => Promise<void> | void
}

export interface AgentDeps {
  step: (req: AgentStepRequest) => Promise<AgentStepResponse>
  runTool: (name: string, input: unknown) => Promise<ToolOutcome>
  confirm: (card: ConfirmCardInput) => Promise<boolean>
  emit: Emit
  lang: () => Lang
  sessionId: string
  /** Active character card, sent with every step. */
  persona?: () => Persona | undefined
  /** Task model chosen in the settings (Sonnet by default). */
  model?: () => AgentModel
  channelName?: (channelId: string) => string | undefined
  /** Id lookups for the confirm card preview (mail subject, draft, event). */
  preview?: Omit<PreviewLookup, 'channelName'>
  /** Permission level; decides which grades need a confirm card. Defaults to manual. */
  permission?: () => PermissionLevel
  actuator?: Actuator
  /** A task starts running (after a suggestion is accepted, or right away for a request). */
  onStart?: (origin: DelegateOrigin) => void
  /** The task ended, just before its result is spoken. */
  onResult?: (result: AgentResult) => void
  /** A prepared line for the active character (built-in voice clip); falls back to AGENT_STRINGS. */
  preparedLine?: (kind: 'done' | 'incomplete' | 'offline') => string | undefined
  now?: () => Date
  maxSteps?: number
}

interface ToolUseBlock { type: 'tool_use', id: string, name: string, input: unknown }
interface ToolResultBlock { type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }

const isToolUse = (b: unknown): b is ToolUseBlock =>
  typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'tool_use'
    && typeof (b as ToolUseBlock).id === 'string' && typeof (b as ToolUseBlock).name === 'string'

export function textOf(content: unknown[]): string {
  return content
    .filter((b): b is { type: 'text', text: string } =>
      typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string')
    .map(b => b.text)
    .join('\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Context and speech helpers

function localIso(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
}

export function buildUserContent(request: string, origin: DelegateOrigin, lang: Lang, now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  let tz = 'local'
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local' } catch { /* keep default */ }
  const how = origin === 'screen'
    ? 'You offered this based on what is on the user\'s screen, and the user accepted.'
    : 'The user asked for this directly (voice or typed chat).'
  return `${request}\n\n<context>\nNow: ${localIso(now)} (${weekday}, ${tz})\nUser language: ${lang}\n${how}\n</context>`
}

const SENTENCE_END = /[.!?。！？](?=\s|$)|[。！？]/g

/** First paragraph as the spoken line (markdown stripped, capped), plus whether there is more. */
export function splitForSpeech(text: string, cap = 220): { line: string, hasMore: boolean } {
  const clean = (s: string) => s.replace(/\*\*|__|`|^#+\s*|^\s*[-*•]\s+/gm, '').trim()
  const paragraphs = text.split(/\n\s*\n/).map(clean).filter(Boolean)
  let line = (paragraphs[0] ?? '').replace(/\s*\n\s*/g, ' ')
  let truncated = false
  if (line.length > cap) {
    let cut = -1
    for (const m of line.matchAll(SENTENCE_END)) {
      const end = (m.index ?? 0) + m[0].length
      if (end <= cap) cut = end
      else break
    }
    line = cut > 0 ? line.slice(0, cut).trim() : `${line.slice(0, cap - 1).trim()}…`
    truncated = true
  }
  return { line, hasMore: truncated || paragraphs.length > 1 }
}

// ---------------------------------------------------------------------------
// Loop

export type AgentResult =
  | { ok: true, text: string, steps: number }
  | { ok: false, cause: 'max_steps' | 'error', error?: unknown, steps: number }

function toolResult(id: string, outcome: ToolOutcome): ToolResultBlock {
  if (!outcome.ok) return { type: 'tool_result', tool_use_id: id, content: outcome.error, is_error: true }
  let s = JSON.stringify(outcome.data ?? null)
  if (s.length > MAX_TOOL_RESULT_CHARS) s = `${s.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]`
  return { type: 'tool_result', tool_use_id: id, content: s }
}

async function act(deps: AgentDeps, fn: (a: Actuator) => Promise<void> | void): Promise<void> {
  if (!deps.actuator) return
  try { await fn(deps.actuator) } catch (e) { console.warn('[agent] actuator', e) }
}

async function runToolUse(tu: ToolUseBlock, deps: AgentDeps): Promise<ToolResultBlock> {
  const spec = getOpSpec(tu.name)
  if (!spec) return toolResult(tu.id, { ok: false, error: `Unknown tool "${tu.name}".` })
  const op = spec.name as ConnectorOpName
  const parsed = spec.input.safeParse(tu.input ?? {})
  if (!parsed.success) return toolResult(tu.id, { ok: false, error: `Invalid input for ${spec.name}: ${parsed.error.message}` })
  const input = parsed.data as Record<string, unknown>

  await act(deps, a => a.before(op, input, spec.grade))
  if (requiresConfirmation(spec.grade, deps.permission?.() ?? 'manual')) {
    // Validated values go on the card, so the user approves exactly what will run.
    const fields = buildWritePreview(op, input, { ...deps.preview, channelName: deps.channelName })
    const accepted = await deps.confirm({ kind: 'write', op, grade: spec.grade === 'outbound' ? 'outbound' : 'write', fields })
    deps.emit('character:node', { node: 'working' })
    if (!accepted) {
      await act(deps, a => a.after(op, input, null))
      return { type: 'tool_result', tool_use_id: tu.id, content: DECLINED_RESULT, is_error: false }
    }
  }
  const outcome = await deps.runTool(spec.name, input)
  await act(deps, a => a.after(op, input, outcome))
  return toolResult(tu.id, outcome)
}

export async function runAgentTask(request: string, origin: DelegateOrigin, deps: AgentDeps): Promise<AgentResult> {
  const lang = deps.lang()
  const now = deps.now?.() ?? new Date()
  const maxSteps = deps.maxSteps ?? MAX_STEPS
  const messages: unknown[] = [{ role: 'user', content: buildUserContent(request, origin, lang, now) }]

  for (let step = 1; step <= maxSteps; step++) {
    const persona = deps.persona?.()
    const model = deps.model?.()
    const res = await deps.step({ lang, origin, messages, sessionId: deps.sessionId, ...(persona ? { persona } : {}), ...(model ? { model } : {}) })
    // Assistant content goes back unchanged (thinking blocks included).
    messages.push({ role: 'assistant', content: res.content })
    const toolUses = res.content.filter(isToolUse)
    if (res.stopReason !== 'tool_use' || toolUses.length === 0) {
      return { ok: true, text: textOf(res.content), steps: step }
    }
    const results: ToolResultBlock[] = []
    for (const tu of toolUses) results.push(await runToolUse(tu, deps))
    messages.push({ role: 'user', content: results })
  }
  return { ok: false, cause: 'max_steps', steps: maxSteps }
}

// ---------------------------------------------------------------------------
// Delegation handler: suggestion card, busy/node state, final speech.

function speak(deps: AgentDeps, text: string, emotion: Emotion, source: 'agent' | 'fallback') {
  const { line, hasMore } = splitForSpeech(text)
  deps.emit('character:react', { emotion, line: line || undefined, source })
  if (hasMore) deps.emit('bubble', { text, ttlMs: Math.min(30_000, 6_000 + text.length * 80) })
}

export async function handleDelegate(payload: BusEvents['agent:delegate'], deps: AgentDeps): Promise<AgentResult | null> {
  if (payload.origin === 'screen') {
    const accepted = await deps.confirm({ kind: 'suggestion', request: payload.request, summary: payload.summary, timeoutMs: SUGGESTION_TIMEOUT_MS })
    if (!accepted) {
      deps.emit('character:node', { node: 'idle' })
      deps.emit('character:react', { emotion: 'neutral', source: 'agent' })
      return null
    }
  }

  deps.emit('agent:busy', { busy: true })
  deps.emit('character:node', { node: 'working' })
  deps.onStart?.(payload.origin)
  let result: AgentResult
  try {
    result = await runAgentTask(payload.request, payload.origin, deps)
  } catch (error) {
    console.warn('[agent] task failed', error)
    result = { ok: false, cause: 'error', error, steps: 0 }
  } finally {
    deps.emit('agent:busy', { busy: false })
    deps.emit('character:node', { node: 'idle' })
  }

  deps.onResult?.(result)
  const s = AGENT_STRINGS[deps.lang()]
  const prepared = (kind: 'done' | 'incomplete' | 'offline', fallback: string) => deps.preparedLine?.(kind) || fallback
  if (result.ok) speak(deps, result.text || prepared('done', s.doneLine), 'happy', 'agent')
  else if (result.cause === 'max_steps') speak(deps, prepared('incomplete', s.incompleteLine), 'sorry', 'agent')
  else speak(deps, prepared('offline', s.fallbackLine), 'sorry', 'fallback')
  return result
}
