// Browser side of the optional live connectors: POST /api/connectors/<service>.

import type { ApiError, ConnectorService } from '@shared/contracts'
import { apiUrl } from '@/core/api'

export class LiveConnectorError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiError['code']) { super(message) }
}

export async function callLive(
  service: ConnectorService,
  op: string,
  input: unknown,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(apiUrl(`/api/connectors/${service}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, input, sessionId }),
  })
  const data = await res.json().catch(() => null) as unknown
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>
    throw new LiveConnectorError(err.error ?? `HTTP ${res.status}`, res.status, err.code)
  }
  return data
}
