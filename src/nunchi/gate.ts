// Deterministic rule gate for proactive (screen-only) observer actions.
// Utterance responses never pass through here and are never counted.

export const GATE = {
  maxPerDay: 3,
  cooldownMs: 10 * 60_000,
  minDwellSec: 20,
} as const

export interface Ledger {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  count: number
  lastAt: number | null
}

export interface GateInput {
  now: number
  ledger: Ledger
  dwellSec: number
  typing: boolean
  userSpeaking: boolean
}

export type GateReason = 'daily_limit' | 'cooldown' | 'dwell' | 'typing' | 'speaking'
export type GateResult = { allow: true } | { allow: false, reason: GateReason }

export function localDay(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns the ledger for `now`, resetting the count on a new day. */
export function currentLedger(ledger: Ledger | null, now: number): Ledger {
  const day = localDay(now)
  if (!ledger || ledger.day !== day) return { day, count: 0, lastAt: ledger?.lastAt ?? null }
  return ledger
}

export function gateProactive(i: GateInput): GateResult {
  const ledger = currentLedger(i.ledger, i.now)
  if (ledger.count >= GATE.maxPerDay) return { allow: false, reason: 'daily_limit' }
  if (ledger.lastAt !== null && i.now - ledger.lastAt < GATE.cooldownMs) return { allow: false, reason: 'cooldown' }
  if (i.typing) return { allow: false, reason: 'typing' }
  if (i.userSpeaking) return { allow: false, reason: 'speaking' }
  if (i.dwellSec < GATE.minDwellSec) return { allow: false, reason: 'dwell' }
  return { allow: true }
}

export function recordInterjection(ledger: Ledger | null, now: number): Ledger {
  const l = currentLedger(ledger, now)
  return { day: l.day, count: l.count + 1, lastAt: now }
}

export function minutesSince(ledger: Ledger, now: number): number | null {
  return ledger.lastAt === null ? null : Math.floor((now - ledger.lastAt) / 60_000)
}

// --- persistence

export const LEDGER_KEY = 'yuiyumi.nunchi.ledger'

export interface KV {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadLedger(storage: KV, now: number): Ledger {
  try {
    const raw = storage.getItem(LEDGER_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Ledger>) : null
    const valid = parsed && typeof parsed.day === 'string' && typeof parsed.count === 'number'
      ? { day: parsed.day, count: parsed.count, lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : null }
      : null
    return currentLedger(valid, now)
  } catch {
    return currentLedger(null, now)
  }
}

export function saveLedger(storage: KV, ledger: Ledger): void {
  try { storage.setItem(LEDGER_KEY, JSON.stringify(ledger)) } catch { /* storage full or blocked */ }
}
