// POST /api/anthropic/v1/messages[/count_tokens]: Messages API proxy for the desktop agent
// runtime (see _proxy.ts). POST /api/anthropic/install mints its per-install token.

import { handleProxy } from './_proxy.js'

export const POST = (request: Request) => handleProxy(request)
