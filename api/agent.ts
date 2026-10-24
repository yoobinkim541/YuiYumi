// POST /api/agent: one Sonnet call per request. The browser runs the tools and loops.

import { AgentStepRequestSchema, type AgentStepResponse } from '../shared/contracts'
import { anthropic, anthropicConfigured, MODELS } from '../server/anthropic'
import { admit, record } from '../server/budget'
import { fail, json, parseBody } from '../server/http'
import { buildAgentRequest, sanitizeMessages } from '../server/prompts/agent'

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, AgentStepRequestSchema)
  if (body instanceof Response) return body

  const messages = sanitizeMessages(body.messages)
  if (!messages) return fail(400, 'invalid messages', 'bad_request')

  if (!anthropicConfigured()) return fail(503, 'agent model not configured', 'unconfigured')
  if (!admit(body.sessionId)) return fail(429, 'budget reached', 'budget')

  const model = MODELS.agent()
  try {
    const msg = await anthropic().messages.create(buildAgentRequest({ model, lang: body.lang, origin: body.origin, messages, persona: body.persona }))
    record(model, msg.usage)
    return json({ content: msg.content, stopReason: msg.stop_reason } satisfies AgentStepResponse)
  } catch (e) {
    const status = (e as { status?: number }).status
    console.error('[api/agent] provider error', status, (e as Error).message)
    return fail(502, 'agent provider error', 'provider')
  }
}
