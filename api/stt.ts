// POST /api/stt?lang=<Lang>&sessionId=<id>  body: audio/wav (16 kHz mono 16-bit)
// Response: Transcript JSON. The provider sits behind SttProvider.

import { LangSchema, type Transcript } from '../shared/contracts'
import { admit } from '../server/budget'
import { deepgramStt } from '../server/deepgram'
import { fail, json } from '../server/http'
import { ProviderError, ProviderUnconfiguredError, type SttProvider } from '../server/voice-providers'

const MAX_BYTES = 2 * 1024 * 1024
const MIN_BYTES = 44 // WAV header only
const provider: SttProvider = deepgramStt

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const lang = LangSchema.safeParse(url.searchParams.get('lang'))
  if (!lang.success) return fail(400, 'invalid lang', 'bad_request')
  const sessionId = url.searchParams.get('sessionId')
  if (!sessionId || sessionId.length > 100) return fail(400, 'missing sessionId', 'bad_request')

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BYTES) return fail(413, 'audio too large', 'bad_request')
  const wav = await request.arrayBuffer()
  if (wav.byteLength > MAX_BYTES) return fail(413, 'audio too large', 'bad_request')
  if (wav.byteLength <= MIN_BYTES) return fail(400, 'empty audio', 'bad_request')

  if (!admit(sessionId)) return fail(429, 'budget exceeded', 'budget')

  try {
    const transcript: Transcript = await provider.transcribe(wav, lang.data)
    return json(transcript)
  } catch (e) {
    if (e instanceof ProviderUnconfiguredError) return fail(503, 'stt unconfigured', 'unconfigured')
    if (e instanceof ProviderError) return fail(502, e.message, 'provider')
    return fail(502, 'stt failed', 'provider')
  }
}
