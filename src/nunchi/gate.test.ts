import { describe, expect, it } from 'vitest'
import { currentLedger, gateProactive, loadLedger, localDay, recordInterjection, saveLedger, type KV, type Ledger } from './gate'

const NOW = new Date(2026, 9, 24, 14, 0, 0).getTime()
const MIN = 60_000

function ledger(count: number, lastAt: number | null = null): Ledger {
  return { day: localDay(NOW), count, lastAt }
}

const base = { now: NOW, dwellSec: 25, typing: false, userSpeaking: false }

describe('gateProactive', () => {
  it('allows when all conditions hold', () => {
    expect(gateProactive({ ...base, ledger: ledger(0) })).toEqual({ allow: true })
  })
  it('drops after 3 interjections today (AC-3)', () => {
    expect(gateProactive({ ...base, ledger: ledger(2, NOW - 60 * MIN) }).allow).toBe(true)
    expect(gateProactive({ ...base, ledger: ledger(3, NOW - 60 * MIN) })).toEqual({ allow: false, reason: 'daily_limit' })
  })
  it('drops within 10 minutes of the last interjection', () => {
    expect(gateProactive({ ...base, ledger: ledger(1, NOW - 9 * MIN) })).toEqual({ allow: false, reason: 'cooldown' })
    expect(gateProactive({ ...base, ledger: ledger(1, NOW - 10 * MIN) }).allow).toBe(true)
  })
  it('drops while dwell is under 20 s (AC-1 timing)', () => {
    expect(gateProactive({ ...base, dwellSec: 19, ledger: ledger(0) })).toEqual({ allow: false, reason: 'dwell' })
    expect(gateProactive({ ...base, dwellSec: 20, ledger: ledger(0) }).allow).toBe(true)
  })
  it('drops while typing (AC-2) or speaking', () => {
    expect(gateProactive({ ...base, typing: true, ledger: ledger(0) })).toEqual({ allow: false, reason: 'typing' })
    expect(gateProactive({ ...base, userSpeaking: true, ledger: ledger(0) })).toEqual({ allow: false, reason: 'speaking' })
  })
  it('resets the daily count on a new day', () => {
    const yesterday: Ledger = { day: '2026-10-23', count: 3, lastAt: NOW - 20 * 60 * MIN }
    expect(gateProactive({ ...base, ledger: yesterday }).allow).toBe(true)
    expect(currentLedger(yesterday, NOW).count).toBe(0)
  })
})

describe('ledger', () => {
  it('records and persists interjections', () => {
    const mem = new Map<string, string>()
    const kv: KV = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) } }
    let l = loadLedger(kv, NOW)
    expect(l.count).toBe(0)
    l = recordInterjection(l, NOW)
    saveLedger(kv, l)
    const back = loadLedger(kv, NOW + MIN)
    expect(back).toEqual({ day: localDay(NOW), count: 1, lastAt: NOW })
  })
  it('survives corrupt storage', () => {
    const kv: KV = { getItem: () => '{not json', setItem: () => {} }
    expect(loadLedger(kv, NOW).count).toBe(0)
  })
})

describe('gate config', () => {
  it('reads limits from the live config object', async () => {
    const { nunchiConfig, resetNunchiConfig } = await import('./config')
    try {
      nunchiConfig.maxPerDay = 1
      expect(gateProactive({ ...base, ledger: ledger(1, NOW - 60 * MIN) })).toEqual({ allow: false, reason: 'daily_limit' })
      nunchiConfig.maxPerDay = 5
      nunchiConfig.minDwellSec = 30
      expect(gateProactive({ ...base, ledger: ledger(3, NOW - 60 * MIN) })).toEqual({ allow: false, reason: 'dwell' })
    } finally {
      resetNunchiConfig()
    }
  })
})
