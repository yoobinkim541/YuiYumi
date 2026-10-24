import { ObserveResponseSchema, type ApiError, type ObserveRequest, type ObserveResponse } from '@shared/contracts'

export type ObserveResult =
  | { ok: true, response: ObserveResponse }
  | { ok: false, aborted: boolean, code?: ApiError['code'], status?: number }

export async function postObserve(req: ObserveRequest, signal?: AbortSignal): Promise<ObserveResult> {
  try {
    const res = await fetch('/api/observe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, aborted: false, code: (data as ApiError | null)?.code, status: res.status }
    const parsed = ObserveResponseSchema.safeParse(data)
    if (!parsed.success) return { ok: false, aborted: false, code: 'provider', status: res.status }
    return { ok: true, response: parsed.data }
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    return { ok: false, aborted }
  }
}
