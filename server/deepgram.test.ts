import { describe, expect, it } from 'vitest'
import { mapDeepgramResponse } from './deepgram.js'

describe('mapDeepgramResponse', () => {
  it('maps the first alternative', () => {
    const t = mapDeepgramResponse({ results: { channels: [{ alternatives: [{ transcript: ' 안녕하세요 ', confidence: 0.98 }] }] } }, 'ko')
    expect(t).toEqual({ text: '안녕하세요', confidence: 0.98, lang: 'ko' })
  })
  it('returns empty text when nothing was heard', () => {
    expect(mapDeepgramResponse({}, 'ja')).toEqual({ text: '', confidence: null, lang: 'ja' })
  })
})
