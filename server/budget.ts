// Spend guard for the public demo link. In-memory per function instance: a soft cap, not
// an exact ledger. When it trips the client falls back to prepared lines (AC-8).

import { env } from './http'

// USD per million tokens. Check the current price list before relying on these.
const PRICE: Record<string, { in: number, out: number }> = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.0, out: 10.0 },
}

const day = () => new Date().toISOString().slice(0, 10)
let spentDay = day()
let spentUsd = 0
const sessionCalls = new Map<string, number>()
/** Outbound ops (send mail, post to chat) per session and per connected account. */
const outbound = new Map<string, number>()

/** Desktop agent runtime spend (api/anthropic proxy) per install, USD today. */
const installUsd = new Map<string, number>()

function roll() {
  if (spentDay !== day()) { spentDay = day(); spentUsd = 0; sessionCalls.clear(); outbound.clear(); installUsd.clear() }
}

/** Returns false when the call should be refused. */
export function admit(sessionId: string): boolean {
  roll()
  const dailyCap = Number(env('BUDGET_DAILY_USD') ?? 150)
  const sessionCap = Number(env('BUDGET_SESSION_CALLS') ?? 1200)
  const calls = sessionCalls.get(sessionId) ?? 0
  if (spentUsd >= dailyCap || calls >= sessionCap) return false
  sessionCalls.set(sessionId, calls + 1)
  return true
}

export function record(model: string, usage: { input_tokens?: number, output_tokens?: number } | undefined) {
  if (!usage) return
  const p = PRICE[model] ?? (model.startsWith('claude-opus') ? OPUS_PRICE : PRICE['claude-sonnet-5-5']!)
  spentUsd += ((usage.input_tokens ?? 0) * p.in + (usage.output_tokens ?? 0) * p.out) / 1_000_000
}

export function outboundLimits() {
  return {
    outboundPerSession: Number(env('OUTBOUND_SESSION_CAP') ?? 10),
    outboundPerAccountDaily: Number(env('OUTBOUND_ACCOUNT_DAILY_CAP') ?? 30),
  }
}

/**
 * Counts one outbound op (mail send/reply, chat post) for the session and the account.
 * Returns a user-facing refusal when a cap is reached, otherwise null.
 */
export function admitOutbound(sessionId: string, account: string): string | null {
  roll()
  const { outboundPerSession, outboundPerAccountDaily } = outboundLimits()
  const s = outbound.get(`s:${sessionId}`) ?? 0
  const a = outbound.get(`a:${account}`) ?? 0
  if (s >= outboundPerSession) return `Sending limit for this session reached (${outboundPerSession}). Nothing was sent.`
  if (a >= outboundPerAccountDaily) return `Daily sending limit for this account reached (${outboundPerAccountDaily}). Nothing was sent.`
  outbound.set(`s:${sessionId}`, s + 1)
  outbound.set(`a:${account}`, a + 1)
  return null
}

/** Small per-key daily counter for rare actions (sample data). False when `cap` is reached. */
export function admitCount(key: string, cap: number): boolean {
  roll()
  const n = outbound.get(`k:${key}`) ?? 0
  if (n >= cap) return false
  outbound.set(`k:${key}`, n + 1)
  return true
}

// ---------------------------------------------------------------------------
// Desktop agent runtime (api/anthropic proxy): a daily USD cap per install on top of the
// shared daily cap. Prompt caching matters here: writes cost 1.25x input, reads 0.1x.

export interface ProxyUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

const OPUS_PRICE = { in: 4.0, out: 20.0 }

export function usageCostUsd(model: string, u: ProxyUsage): number {
  const p = PRICE[model] ?? (model.startsWith('claude-opus') ? OPUS_PRICE : PRICE['claude-sonnet-5-5']!)
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1
  return (input * p.in + (u.output_tokens ?? 0) * p.out) / 1_000_000
}

/** False when the install or the whole deployment reached today's cap. */
export function admitInstall(installId: string): boolean {
  roll()
  const dailyCap = Number(env('BUDGET_DAILY_USD') ?? 150)
  const installCap = Number(env('BUDGET_INSTALL_DAILY_USD') ?? 5)
  return spentUsd < dailyCap && (installUsd.get(installId) ?? 0) < installCap
}

export function recordInstall(installId: string, model: string, usage: ProxyUsage): void {
  roll()
  const cost = usageCostUsd(model, usage)
  spentUsd += cost
  installUsd.set(installId, (installUsd.get(installId) ?? 0) + cost)
}
