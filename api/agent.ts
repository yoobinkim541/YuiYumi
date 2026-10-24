// POST /api/agent: one task-model call (Sonnet or Opus) per request. The browser runs the tools and loops.

import { AgentStepRequestSchema, type AgentStepResponse } from '../shared/contracts.js'
import { anthropic, anthropicConfigured, MODELS } from '../server/anthropic.js'
import { admit, record } from '../server/budget.js'
import { fail, json, parseBody, preflight, withCors } from '../server/http.js'
import { buildAgentRequest, sanitizeMessages } from '../server/prompts/agent.js'

async function post(request: Request): Promise<Response> {
  const body = await parseBody(request, AgentStepRequestSchema)
  if (body instanceof Response) return body

  const messages = sanitizeMessages(body.messages)
  if (!messages) return fail(400, 'invalid messages', 'bad_request')

  if (!anthropicConfigured()) return fail(503, 'agent model not configured', 'unconfigured')
  if (!admit(body.sessionId)) return fail(429, 'budget reached', 'budget')

  const model = MODELS.agent(body.model)
  try {
    const msg = await anthropic().messages.create(buildAgentRequest({ model, lang: body.lang, origin: body.origin, messages, persona: body.persona, host: body.host }))
    record(model, msg.usage)
    return json({ content: msg.content, stopReason: msg.stop_reason } satisfies AgentStepResponse)
  } catch (e) {
    const status = (e as { status?: number }).status
    console.error('[api/agent] provider error', status, (e as Error).message)
    return fail(502, 'agent provider error', 'provider')
  }
}

export const POST = withCors(post)
export const OPTIONS = preflight
