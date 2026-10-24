// GET /api/model-key -> { key: <base64 AES-256 key> }
// Key for the encrypted Live2D model packs under /models/<id>.bin. This is a deterrent
// against casual asset scraping, not DRM: the browser necessarily receives the key.

import { preflight, withCors } from '../server/http'

async function get(): Promise<Response> {
  const key = process.env.MODEL_ASSET_KEY
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }
  if (!key) return new Response(JSON.stringify({ error: 'model key not configured', code: 'unconfigured' }), { status: 503, headers })
  return new Response(JSON.stringify({ key }), { status: 200, headers })
}

export const GET = withCors(get)
export const OPTIONS = preflight
