import { describe, expect, it } from 'vitest'
import { LANGS } from '@shared/languages'
import { pickFallback, setFallbackCharacter } from '@/nunchi/fallback-lines'
import { allBuiltinLines, BUILTIN_CATEGORIES, BUILTIN_LINES, findBuiltin, greetingCategory, linesFor, pickVariant, stripAudioTags } from './builtin-lines'

describe('built-in line table', () => {
  it('has every category in every language for both characters', () => {
    for (const character of ['tt2', 'yui'] as const) {
      for (const lang of LANGS) {
        for (const category of BUILTIN_CATEGORIES) {
          expect(BUILTIN_LINES[character][lang][category].length, `${character}/${lang}/${category}`).toBeGreaterThan(0)
        }
        expect(linesFor(character, lang, 'petFast').length).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('gives each line a unique id and a non-empty shown text', () => {
    const lines = allBuiltinLines()
    const keys = new Set(lines.map(l => `${l.character}/${l.lang}/${l.id}`))
    expect(keys.size).toBe(lines.length)
    for (const l of lines) expect(l.display.length, l.text).toBeGreaterThan(0)
  })

  it('removes audio tags for the bubble', () => {
    expect(stripAudioTags('[giggles] 아잇, 간지러워!')).toBe('아잇, 간지러워!')
    expect(stripAudioTags('Eek! Too fast! [giggles]')).toBe('Eek! Too fast!')
    expect(stripAudioTags('[laughs softly] ok [sighs] fine')).toBe('ok fine')
  })
})

describe('pickVariant', () => {
  it('never repeats the previous variant when there is a choice', () => {
    for (let last = 0; last < 4; last++) {
      for (const r of [0, 0.2, 0.5, 0.74, 0.99]) {
        const i = pickVariant(4, last, () => r)
        expect(i).not.toBe(last)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(4)
      }
    }
  })

  it('reaches every other variant', () => {
    const seen = new Set([0, 0.34, 0.67, 0.99].map(r => pickVariant(4, 1, () => r)))
    expect([...seen].sort()).toEqual([0, 2, 3])
  })

  it('handles a first pick and single-variant lists', () => {
    expect(pickVariant(3, undefined, () => 0.99)).toBe(2)
    expect(pickVariant(1, 0, () => 0.5)).toBe(0)
    expect(pickVariant(3, 7, () => 0)).toBe(0)
  })
})

describe('findBuiltin', () => {
  it('matches a react line to the clip of the same character and language', () => {
    const shown = linesFor('tt2', 'ko', 'done')[0]!.display
    expect(findBuiltin('tt2', 'ko', shown)).toMatchObject({ character: 'tt2', lang: 'ko', category: 'done', id: 'done-1' })
    // Same text in another language or for the other character is not this clip.
    expect(findBuiltin('tt2', 'ja', shown)).toBeNull()
    expect(findBuiltin('yui', 'ko', shown)).toBeNull()
  })

  it('matches lines written with audio tags by their shown text', () => {
    const line = linesFor('yui', 'en', 'petFast')[0]!
    expect(line.text).toContain('[')
    expect(findBuiltin('yui', 'en', line.display)?.id).toBe(line.id)
    expect(findBuiltin('yui', 'en', `  ${line.display}  `)?.id).toBe(line.id)
  })

  it('matches a line with separate spoken text by what is shown', () => {
    const line = linesFor('tt2', 'zh-Hant', 'reminder')[0]!
    expect(line.display).toBe('叮咚！時間到囉！')
    expect(line.text).toBe('叮咚！时间到啰！')
    expect(findBuiltin('tt2', 'zh-Hant', '叮咚！時間到囉！')?.id).toBe('reminder-1')
  })

  it('does not match other text', () => {
    expect(findBuiltin('tt2', 'en', 'Something the model said.')).toBeNull()
    expect(findBuiltin('tt2', 'en', '')).toBeNull()
  })
})

describe('fallback lines', () => {
  it('come from the active character and match a built-in clip', () => {
    setFallbackCharacter(() => 'yui')
    const f = pickFallback('ko', 0)
    expect(f.emotion).toBe('sorry')
    expect(findBuiltin('yui', 'ko', f.line)?.category).toBe('offline')
    setFallbackCharacter(() => 'tt2')
    expect(findBuiltin('tt2', 'ja', pickFallback('ja', 1).line)?.category).toBe('offline')
  })
})

describe('greetingCategory', () => {
  it('maps hours to the time of day', () => {
    expect(greetingCategory(7)).toBe('greetMorning')
    expect(greetingCategory(13)).toBe('greetAfternoon')
    expect(greetingCategory(19)).toBe('greetEvening')
    expect(greetingCategory(23)).toBe('greetNight')
    expect(greetingCategory(3)).toBe('greetNight')
  })
})
