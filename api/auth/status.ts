// GET /api/auth/status: which providers are connected for this browser (no tokens).

import { authStatus } from '../../server/auth'
import { json, preflight, withCors } from '../../server/http'

export const GET = withCors(async request => json(authStatus(request)))
export const OPTIONS = preflight
