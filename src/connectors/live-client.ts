// Browser side of the live connectors: /api/connectors/<service> and /api/auth/*.
// The browser never sees tokens: same-origin requests carry the sealed httpOnly cookies.
// The desktop app (no cookies across origins) registers a bearer provider instead.

import type { ApiError, AuthStatus, LiveConnectorResponse, LiveProvider, LiveService } from '@shared/contracts'
import { apiUrl } from '@/core/api'

export class LiveConnectorError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiError['code']) { super(message) }
}

let bearer: (() => string | null) | null = null

/**
 * Desktop app: returns "Bearer <blob>[,<blob>...]" built from the sealed blobs it received
 * through the loopback redirect (see server/auth.ts), or null.
 */
export function setLiveAuthHeader(fn: (() => string | null) | null): void {
  bearer = fn
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const auth = bearer?.()
  return { ...extra, ...(auth ? { authorization: auth } : {}) }
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null) as unknown
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>
    throw new LiveConnectorError(err.error ?? `HTTP ${res.status}`, res.status, err.code)
  }
  return data as T
}

export async function callLive(
  service: LiveService,
  op: string,
  input: unknown,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveConnectorResponse> {
  const res = await fetchImpl(apiUrl(`/api/connectors/${service}`), {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ op, input, sessionId }),
  })
  return readJson<LiveConnectorResponse>(res)
}

export async function fetchAuthStatus(fetchImpl: typeof fetch = fetch): Promise<AuthStatus> {
  return readJson<AuthStatus>(await fetchImpl(apiUrl('/api/auth/status'), { headers: headers() }))
}

export async function logoutProvider(p: LiveProvider, fetchImpl: typeof fetch = fetch): Promise<void> {
  await readJson(await fetchImpl(apiUrl(`/api/auth/${p}/logout`), { method: 'POST', headers: headers() }))
}

/** Start URL of the OAuth flow; the server redirects back to `returnPath?connected=<p>`. */
export function connectUrl(p: LiveProvider, returnPath = `${location.pathname}${location.hash}`): string {
  return apiUrl(`/api/auth/${p}/start?${new URLSearchParams({ return: returnPath })}`)
}
