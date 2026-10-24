// Connector registry: one client per CONNECTOR_OPS entry. When the user connected the
// service's provider (LIVE_SERVICES, set at runtime from /api/auth/status), every op of it
// runs on the real account and its result is mirrored into the demo store; otherwise the
// mock acts on the demo store. Live failures fall back to the mock so the demo never
// stalls (AC-8); refusals (unknown id, cap reached) go back to the agent as errors.

import { CONNECTOR_OPS, getOpSpec } from '@shared/contracts'
import { useDemo } from '@/stores/demo'
import { requestConnect } from './connect-prompt'
import { isLiveService, LIVE_SERVICES, useMock } from './live'
import { callLive, LiveConnectorError } from './live-client'
import { MOCK_OPS } from './mock'
import { ConnectorError, type DemoStore, type MockOp, type OpName } from './types'

export { LIVE_SERVICES } from './live'

export type ToolOutcome = { ok: true, data: unknown } | { ok: false, error: string }

/** Ops served by the live endpoint when their service is connected: all mail, calendar, Slack and Discord ops. */
export const LIVE_OPS = new Set<string>(CONNECTOR_OPS.filter(o => isLiveService(o.service)).map(o => o.name))

export interface RunOptions {
  demo?: DemoStore
  sessionId?: string
  live?: Partial<Record<string, boolean>>
  fetchImpl?: typeof fetch
  now?: () => Date
  /** false for the user's own actions in the virtual apps (no assistant marker, no connect prompt). */
  viaAssistant?: boolean
}

const FALLBACK_NOTE = 'The connected account could not be reached, so this was done on the virtual PC only.'

/** Validates the input against the op schema, then runs it. Never throws. */
export async function runConnector(name: string, rawInput: unknown, opts: RunOptions = {}): Promise<ToolOutcome> {
  const spec = getOpSpec(name)
  if (!spec) return { ok: false, error: `Unknown tool "${name}".` }
  const parsed = spec.input.safeParse(rawInput ?? {})
  if (!parsed.success) return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` }

  const live = opts.live ?? LIVE_SERVICES
  const opName = spec.name as OpName
  if (!(opName in MOCK_OPS)) return { ok: false, error: `Unknown tool "${name}".` }
  const service = spec.service
  let fellBack = false
  if (isLiveService(service) && LIVE_OPS.has(opName)) {
    if (live[service] && opts.sessionId) {
      try {
        const res = await callLive(service, opName, parsed.data, opts.sessionId, opts.fetchImpl)
        if (res.patch) (opts.demo ?? useDemo()).applyLivePatch(res.patch, { viaAssistant: opts.viaAssistant !== false })
        return { ok: true, data: res.result }
      } catch (e) {
        if (e instanceof LiveConnectorError && e.code === 'rejected') return { ok: false, error: e.message }
        if (e instanceof LiveConnectorError && e.code === 'not_connected') {
          // Expired or revoked: back to sample data, and tell the agent (and the user) why.
          useMock(service, { demo: opts.demo, sessionId: opts.sessionId }, e.message)
          requestConnect(service, { reason: 'expired', force: true })
          return { ok: false, error: `${e.message} The virtual PC shows sample data again.` }
        }
        console.warn(`[connectors] live ${opName} failed, using mock`, e)
        fellBack = spec.grade !== 'read'
      }
    } else if (opts.viaAssistant !== false) {
      requestConnect(service)
    }
  }

  try {
    const demo = opts.demo ?? useDemo()
    const fn = MOCK_OPS[opName] as MockOp<OpName>
    const data = await fn(demo, parsed.data as never, opts.now?.() ?? new Date())
    return { ok: true, data: fellBack && data && typeof data === 'object' ? { ...data, note: FALLBACK_NOTE } : data }
  } catch (e) {
    if (e instanceof ConnectorError) return { ok: false, error: e.message }
    console.error(`[connectors] ${opName}`, e)
    return { ok: false, error: `${opName} failed.` }
  }
}
