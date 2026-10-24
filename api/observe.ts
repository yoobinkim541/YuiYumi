// POST /api/observe: screen frame + state (+ utterance) -> observer actions (Haiku).

import { ObserveRequestSchema, type ObserveResponse } from '../shared/contracts'
import { anthropic, anthropicConfigured, MODELS } from '../server/anthropic'
import { admit, record } from '../server/budget'
import { fail, json, parseBody, preflight, withCors } from '../server/http'
import { buildObserveRequest, parseObserveActions } from '../server/prompts/observe'

async function post(request: Request): Promise<Response> {
  const body = await parseBody(request, ObserveRequestSchema)
  if (body instanceof Response) return body

  // No key (local dev without .env): keep the app running with silence.
  if (!anthropicConfigured()) return json({ actions: [] } satisfies ObserveResponse)

  if (!admit(body.sessionId)) return fail(429, 'budget cap reached', 'budget')

  const model = MODELS.observer()
  try {
    const message = await anthropic().messages.create(buildObserveRequest(body, model), { signal: request.signal })
    record(model, message.usage)
    return json({ actions: parseObserveActions(message.content) } satisfies ObserveResponse)
  } catch (e) {
    console.error('[observe] provider error', e instanceof Error ? e.message : e)
    return fail(502, 'observer unavailable', 'provider')
  }
}

export const POST = withCors(post)
export const OPTIONS = preflight
