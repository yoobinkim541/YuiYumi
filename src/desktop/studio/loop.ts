// Browser-side step loop of the virtual coding studio. The server does one model call per
// /api/studio request; this loop validates and runs the file tools and feeds results back.
// Pure over its dependencies so it can be tested with a fake fetch.

import type { AgentModel, ApiError } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { getStudioTool, STUDIO_LIMITS, type StudioStepRequest, type StudioStepResponse, type StudioToolName } from '@shared/studio'
import { apiUrl } from '@/core/api'

const MAX_TOOL_RESULT_CHARS = 12_000

export class StudioStepError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiError['code']) { super(message) }
}

export function createStudioStepClient(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return async (req: StudioStepRequest, signal?: AbortSignal): Promise<StudioStepResponse> => {
    const res = await fetchImpl(apiUrl('/api/studio'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    const data = await res.json().catch(() => null) as unknown
    if (!res.ok) {
      const err = (data ?? {}) as Partial<ApiError>
      throw new StudioStepError(err.error ?? `HTTP ${res.status}`, res.status, err.code)
    }
    const body = data as Partial<StudioStepResponse> | null
    if (!body || !Array.isArray(body.content)) throw new StudioStepError('malformed studio response', res.status, 'provider')
    return { content: body.content, stopReason: body.stopReason ?? null }
  }
}

export type StudioToolOutcome = { ok: true, data?: unknown } | { ok: false, error: string }

export interface StudioLoopDeps {
  step: (req: StudioStepRequest, signal?: AbortSignal) => Promise<StudioStepResponse>
  /** Runs a tool whose input already passed validation. finish is handled by the loop. */
  exec: (name: Exclude<StudioToolName, 'finish'>, input: Record<string, unknown>) => Promise<StudioToolOutcome>
  lang: Lang
  sessionId: string
  model?: AgentModel
  signal?: AbortSignal
  maxSteps?: number
  /** Describes the current project for the model ("No current project." when there is none). */
  context?: () => string
  /** Around each model call (status line, thinking bubble). */
  onStep?: (step: number, phase: 'start' | 'end') => void
}

export type StudioLoopResult =
  | { ok: true, summary: string, steps: number, /** The model called finish (vs. ending with text). */ finished: boolean }
  | { ok: false, cause: 'max_steps' | 'error' | 'aborted', error?: unknown, steps: number }

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

export function buildStudioUserContent(request: string, lang: Lang, context: string): string {
  return `${request}\n\n<context>\nUser language: ${lang}\n${context}\n</context>`
}

function result(id: string, outcome: StudioToolOutcome): ToolResultBlock {
  if (!outcome.ok) return { type: 'tool_result', tool_use_id: id, content: outcome.error, is_error: true }
  let s = JSON.stringify(outcome.data ?? { ok: true })
  if (s.length > MAX_TOOL_RESULT_CHARS) s = `${s.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]`
  return { type: 'tool_result', tool_use_id: id, content: s }
}

export const NOT_FINISHED_RESULT = 'Not finished: a tool in this turn reported an error. Fix it, then call open_preview and finish again.'
export const CUT_OFF_NOTE = 'Your last turn hit the output limit and was cut off. Write one file per turn and keep files shorter.'

const aborted = (signal?: AbortSignal) => signal?.aborted === true

export async function runStudioLoop(request: string, deps: StudioLoopDeps): Promise<StudioLoopResult> {
  const maxSteps = deps.maxSteps ?? STUDIO_LIMITS.maxSteps
  const messages: unknown[] = [{ role: 'user', content: buildStudioUserContent(request, deps.lang, deps.context?.() ?? 'No current project.') }]

  for (let step = 1; step <= maxSteps; step++) {
    if (aborted(deps.signal)) return { ok: false, cause: 'aborted', steps: step - 1 }
    deps.onStep?.(step, 'start')
    let res: StudioStepResponse
    try {
      res = await deps.step({ lang: deps.lang, messages, sessionId: deps.sessionId, ...(deps.model ? { model: deps.model } : {}) }, deps.signal)
    } catch (error) {
      if (aborted(deps.signal)) return { ok: false, cause: 'aborted', steps: step }
      return { ok: false, cause: 'error', error, steps: step }
    } finally {
      deps.onStep?.(step, 'end')
    }
    // Assistant content goes back unchanged (thinking blocks included).
    messages.push({ role: 'assistant', content: res.content })
    const toolUses = res.content.filter(isToolUse)
    if (toolUses.length === 0) return { ok: true, summary: textOf(res.content), steps: step, finished: false }

    const results: (ToolResultBlock | { type: 'text', text: string })[] = []
    let summary: string | null = null
    let finishId: string | null = null
    let failed = false
    for (const tu of toolUses) {
      if (aborted(deps.signal)) return { ok: false, cause: 'aborted', steps: step }
      const spec = getStudioTool(tu.name)
      if (!spec) {
        failed = true
        results.push(result(tu.id, { ok: false, error: `Unknown tool "${tu.name}".` }))
        continue
      }
      const parsed = spec.input.safeParse(tu.input ?? {})
      if (!parsed.success) {
        failed = true
        results.push(result(tu.id, { ok: false, error: `Invalid input for ${spec.name}: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` }))
        continue
      }
      if (spec.name === 'finish') {
        summary = (parsed.data as { summary: string }).summary
        finishId = tu.id
        continue
      }
      let outcome: StudioToolOutcome
      try {
        outcome = await deps.exec(spec.name, parsed.data as Record<string, unknown>)
      } catch (e) {
        outcome = { ok: false, error: `Tool failed: ${(e as Error).message}` }
      }
      if (!outcome.ok) failed = true
      results.push(result(tu.id, outcome))
    }

    if (finishId !== null && summary !== null) {
      if (!failed) return { ok: true, summary, steps: step, finished: true }
      results.push(result(finishId, { ok: false, error: NOT_FINISHED_RESULT }))
    }
    if (res.stopReason === 'max_tokens') results.push({ type: 'text', text: CUT_OFF_NOTE })
    messages.push({ role: 'user', content: results })
  }
  return { ok: false, cause: 'max_steps', steps: maxSteps }
}
