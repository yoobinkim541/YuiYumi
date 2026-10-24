// POST /api/tts  body: SpeechRequest JSON  ->  audio/mpeg (streamed)
// 503 {code:'unconfigured'} when the key or the language's voice is missing; the client
// then keeps the text bubble only. The provider sits behind TtsProvider.

import { SpeechRequestSchema } from '../shared/contracts.js'
import { admit } from '../server/budget.js'
import { elevenLabsTts } from '../server/elevenlabs.js'
import { fail, parseBody, preflight, withCors } from '../server/http.js'
import { ProviderError, ProviderUnconfiguredError, type TtsProvider } from '../server/voice-providers.js'

const provider: TtsProvider = elevenLabsTts

async function post(request: Request): Promise<Response> {
  const req = await parseBody(request, SpeechRequestSchema)
  if (req instanceof Response) return req

  // Check configuration before spending budget.
  if (!provider.isConfigured(req.lang, req.character)) return fail(503, 'tts unconfigured', 'unconfigured')
  if (!admit(req.sessionId)) return fail(429, 'budget exceeded', 'budget')

  try {
    const audio = await provider.synthesize(req, request.signal)
    return new Response(audio, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    })
  } catch (e) {
    if (e instanceof ProviderUnconfiguredError) return fail(503, 'tts unconfigured', 'unconfigured')
    if (e instanceof ProviderError) return fail(502, e.message, 'provider')
    return fail(502, 'tts failed', 'provider')
  }
}

export const POST = withCors(post)
export const OPTIONS = preflight
