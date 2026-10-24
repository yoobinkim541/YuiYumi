// POST /api/connectors/<service>: runs a connector op on the user's connected account.
// Body: { op, input, sessionId }. Response: { result, patch? } (see server/connectors.ts).

import { handleConnectorRequest } from '../../server/connectors'
import { preflight, withCors } from '../../server/http'

export const POST = withCors(handleConnectorRequest)
export const OPTIONS = preflight
