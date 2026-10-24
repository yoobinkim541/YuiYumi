// /api/auth/google/start (GET), /callback (GET), /logout (POST). See server/auth.ts.

import { handleAuthRoute } from '../../../server/auth'
import { preflight, withCors } from '../../../server/http'

export const GET = withCors(request => handleAuthRoute(request, 'google'))
export const POST = GET
export const OPTIONS = preflight
