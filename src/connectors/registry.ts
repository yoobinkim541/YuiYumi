// Connector registry: one client per CONNECTOR_OPS entry. Mock (demo session store) by
// default; read ops of a service can go live behind a per-service flag. Live failures fall
// back to the mock so the demo never stalls (AC-8). Write and outbound ops always act on the
// in-page virtual PC; live services stay read-only.

import { getOpSpec, type ConnectorService } from '@shared/contracts'
import { useDemo } from '@/stores/demo'
import { callLive } from './live-client'
import { MOCK_OPS } from './mock'
import { ConnectorError, type DemoStore, type MockOp, type OpName } from './types'

export type ToolOutcome = { ok: true, data: unknown } | { ok: false, error: string }

/** Services whose read ops call /api/connectors/<service>. Set VITE_LIVE_CONNECTORS=slack,discord. */
export const LIVE_SERVICES: Partial<Record<ConnectorService, boolean>> = Object.fromEntries(
  String(import.meta.env.VITE_LIVE_CONNECTORS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).map(s => [s, true]),
)

/** Only these ops are served by the live endpoint; everything else stays on the mock. */
const LIVE_OPS = new Set<OpName>(['slack_channels', 'slack_read', 'discord_channels', 'discord_read'])

export interface RunOptions {
  demo?: DemoStore
  sessionId?: string
  live?: Partial<Record<ConnectorService, boolean>>
  fetchImpl?: typeof fetch
  now?: () => Date
}

/** Validates the input against the op schema, then runs it. Never throws. */
export async function runConnector(name: string, rawInput: unknown, opts: RunOptions = {}): Promise<ToolOutcome> {
  const spec = getOpSpec(name)
  if (!spec) return { ok: false, error: `Unknown tool "${name}".` }
  const parsed = spec.input.safeParse(rawInput ?? {})
  if (!parsed.success) return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` }

  const live = opts.live ?? LIVE_SERVICES
  const opName = spec.name as OpName
  if (!(opName in MOCK_OPS)) return { ok: false, error: `Unknown tool "${name}".` }
  if (live[spec.service] && LIVE_OPS.has(opName) && opts.sessionId) {
    try {
      return { ok: true, data: await callLive(spec.service, opName, parsed.data, opts.sessionId, opts.fetchImpl) }
    } catch (e) {
      console.warn(`[connectors] live ${opName} failed, using mock`, e)
    }
  }

  try {
    const demo = opts.demo ?? useDemo()
    const fn = MOCK_OPS[opName] as MockOp<OpName>
    return { ok: true, data: await fn(demo, parsed.data as never, opts.now?.() ?? new Date()) }
  } catch (e) {
    if (e instanceof ConnectorError) return { ok: false, error: e.message }
    console.error(`[connectors] ${opName}`, e)
    return { ok: false, error: `${opName} failed.` }
  }
}
