// POST /api/studio: one coding-model call (Sonnet or Opus) per request for the virtual coding
// studio of the web demo. The browser runs the file tools against its in-memory project and loops.

import { StudioStepRequestSchema, type StudioStepResponse } from '../shared/studio.js'
import { anthropic, anthropicConfigured, MODELS } from '../server/anthropic.js'
import { admit, record } from '../server/budget.js'
import { fail, json, parseBody, preflight, withCors } from '../server/http.js'
import { buildStudioRequest, sanitizeStudioMessages } from '../server/prompts/studio.js'

async function post(request: Request): Promise<Response> {
  const body = await parseBody(request, StudioStepRequestSchema)
  if (body instanceof Response) return body

  const messages = sanitizeStudioMessages(body.messages)
  if (!messages) return fail(400, 'invalid messages', 'bad_request')

  if (!anthropicConfigured()) return fail(503, 'studio model not configured', 'unconfigured')
  if (!admit(body.sessionId)) return fail(429, 'budget reached', 'budget')

  const model = MODELS.agent(body.model)
  try {
    const msg = await anthropic().messages.create(buildStudioRequest({ model, lang: body.lang, messages }))
    record(model, msg.usage)
    return json({ content: msg.content, stopReason: msg.stop_reason } satisfies StudioStepResponse)
  } catch (e) {
    const status = (e as { status?: number }).status
    console.error('[api/studio] provider error', status, (e as Error).message)
    return fail(502, 'studio provider error', 'provider')
  }
}

export const POST = withCors(post)
export const OPTIONS = preflight
