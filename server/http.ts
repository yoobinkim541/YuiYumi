import type { z } from 'zod'
import type { ApiError } from '../shared/contracts'

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export function fail(status: number, error: string, code?: ApiError['code']): Response {
  return json({ error, code } satisfies ApiError, status)
}

/** Parse a JSON body against a schema; returns a Response on failure. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown
  try { raw = await request.json() } catch { return fail(400, 'invalid json', 'bad_request') }
  const r = schema.safeParse(raw)
  if (!r.success) return fail(400, r.error.message, 'bad_request')
  return r.data
}

export function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}
