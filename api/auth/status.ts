// GET /api/auth/status: which providers are connected for this browser (no tokens).

import { authStatus } from '../../server/auth.js'
import { json, preflight, withCors } from '../../server/http.js'

export const GET = withCors(async request => json(authStatus(request)))
export const OPTIONS = preflight
