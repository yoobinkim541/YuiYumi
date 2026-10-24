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

function roll() {
  if (spentDay !== day()) { spentDay = day(); spentUsd = 0; sessionCalls.clear() }
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
  const p = PRICE[model] ?? PRICE['claude-sonnet-5-5']!
  spentUsd += ((usage.input_tokens ?? 0) * p.in + (usage.output_tokens ?? 0) * p.out) / 1_000_000
}
