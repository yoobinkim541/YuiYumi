// /api/auth/discord/start (GET), /callback (GET), /logout (POST). See server/auth.ts.

import { handleAuthRoute } from '../../../server/auth.js'
import { preflight, withCors } from '../../../server/http.js'

export const GET = withCors(request => handleAuthRoute(request, 'discord'))
export const POST = GET
export const OPTIONS = preflight
