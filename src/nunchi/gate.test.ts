import { describe, expect, it } from 'vitest'
import { gateProactive, PROACTIVE_GAP_MS } from './gate'

const NOW = new Date(2026, 9, 24, 14, 0, 0).getTime()

const base = { now: NOW, lastLineAt: null, userSpeaking: false, ttsPlaying: false, agentBusy: false }

describe('gateProactive', () => {
  it('allows with no line said yet, whatever the screen or count', () => {
    expect(gateProactive(base)).toEqual({ allow: true })
  })
  it('keeps a short gap after her last line', () => {
    expect(gateProactive({ ...base, lastLineAt: NOW - PROACTIVE_GAP_MS + 1 })).toEqual({ allow: false, reason: 'gap' })
    expect(gateProactive({ ...base, lastLineAt: NOW - PROACTIVE_GAP_MS }).allow).toBe(true)
  })
  it('has no daily limit: remarks keep coming as long as the gap is kept', () => {
    let last: number | null = null
    let shown = 0
    for (let t = NOW; t < NOW + 60 * 60_000; t += 3000) {
      if (gateProactive({ ...base, now: t, lastLineAt: last }).allow) { shown++; last = t }
    }
    expect(shown).toBeGreaterThan(100)
  })
  it('never talks over the user, her own voice, or a running task', () => {
    expect(gateProactive({ ...base, userSpeaking: true })).toEqual({ allow: false, reason: 'speaking' })
    expect(gateProactive({ ...base, ttsPlaying: true })).toEqual({ allow: false, reason: 'talking' })
    expect(gateProactive({ ...base, agentBusy: true })).toEqual({ allow: false, reason: 'busy' })
  })
})
