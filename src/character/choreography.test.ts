import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHOREOGRAPHY, choreographyMotions, MotionPicker, TT2_CHOREOGRAPHY, YUI_CHOREOGRAPHY } from './choreography'

/** Motion3 stems under a model folder; null when the (untracked) model is not checked out. */
function motionStems(dir: string): Set<string> | null {
  if (!existsSync(dir)) return null
  const stems = new Set<string>()
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.motion3.json')) stems.add(basename(entry.name, '.motion3.json').normalize('NFC'))
    }
  }
  walk(dir)
  return stems
}

describe('motion picker', () => {
  it('never picks the same motion twice in a row for one key, and skips what the model lacks', () => {
    let seed = 1
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const picker = new MotionPicker(random)
    const pool = ['a', 'b', 'c']
    let last: string | null = null
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const next = picker.pick('happy', pool)
      expect(next).not.toBe(last)
      seen.add(next!)
      last = next
    }
    expect(seen).toEqual(new Set(pool))
    expect(picker.pick('poke', pool, name => name === 'b')).toBe('b')
    expect(picker.pick('poke', pool, name => name === 'b')).toBe('b')
    expect(picker.pick('none', [])).toBeNull()
  })
})

describe('choreography', () => {
  it('leaves curious and focused without motions (a glance and the working loop carry them)', () => {
    for (const c of [YUI_CHOREOGRAPHY, TT2_CHOREOGRAPHY]) {
      expect(c.emotions.curious).toEqual([])
      expect(c.emotions.focused).toEqual([])
      expect(c.emotions.neutral).toEqual([])
      for (const emotion of ['happy', 'thinking', 'surprised', 'sorry'] as const) expect(c.emotions[emotion].length).toBeGreaterThan(1)
    }
  })

  it('keeps Yui\'s tongue and face-added motions off Yumi', () => {
    for (const name of choreographyMotions(TT2_CHOREOGRAPHY)) {
      expect(name).not.toMatch(/tongue|-face-/)
    }
  })

  it('names only motions the model folders have (when the models are checked out)', () => {
    const yui = motionStems('models/Yui/motions')
    const tt2 = motionStems('models/TT2.0/motions')
    if (!yui || !tt2) return
    for (const name of choreographyMotions(CHOREOGRAPHY.yui)) expect(yui.has(name), name).toBe(true)
    for (const name of choreographyMotions(CHOREOGRAPHY.tt2)) expect(yui.has(name) || tt2.has(name), name).toBe(true)
  })
})
