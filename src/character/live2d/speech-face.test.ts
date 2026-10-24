import { describe, expect, it } from 'vitest'
import { SPEECH_FACE, SpeechFace } from './procedural'

const frame = 1000 / 60

/** Steps `ms` of frames with the mouth at `open(t)` (null: no line playing); returns every output. */
function run(face: SpeechFace, ms: number, open: (t: number) => number | null) {
  const out = []
  for (let t = 0; t < ms; t += frame) out.push(face.step(frame, open(t)))
  return out
}

describe('speech face', () => {
  it('blinks once at a pause after a phrase, not at every syllable gap', () => {
    const face = new SpeechFace(() => 0.5)
    // Syllables every 160 ms with 60 ms gaps: no pause yet.
    const talk = run(face, 1500, t => (t % 160) < 100 ? 0.6 : 0.05)
    expect(talk.filter(o => o.blink)).toHaveLength(0)
    // A pause: one blink.
    const pause = run(face, 600, () => 0)
    expect(pause.filter(o => o.blink)).toHaveLength(1)
    // Another phrase right after: no second blink within the minimum interval.
    run(face, 500, () => 0.6)
    expect(run(face, 400, () => 0).filter(o => o.blink)).toHaveLength(0)
  })

  it('raises the brows at a phrase start and lets them down again', () => {
    const face = new SpeechFace(() => 0)
    const start = run(face, 300, () => 0.6)
    expect(Math.max(...start.map(o => o.brow))).toBeGreaterThan(SPEECH_FACE.browRaise * 0.8)
    const later = run(face, 600, () => 0.6)
    expect(later.at(-1)!.brow).toBeLessThan(0.02)
  })

  it('drifts mouth and brows only while she is not talking, fading in after a line', () => {
    const face = new SpeechFace(() => 0.3)
    const talking = run(face, 1000, () => 0.5)
    expect(talking.every(o => o.mouthX === 0 && o.shrug === 0)).toBe(true)
    const after = run(face, 6000, () => null)
    expect(after[10]!.shrug).toBeLessThan(1e-6) // still in the lip-sync handoff
    const settled = after.slice(-60)
    expect(Math.max(...settled.map(o => Math.abs(o.mouthX)))).toBeLessThanOrEqual(SPEECH_FACE.driftMouthX)
    expect(Math.max(...settled.map(o => o.shrug))).toBeGreaterThan(0)
    expect(Math.min(...settled.map(o => o.shrug))).toBeGreaterThanOrEqual(0)
  })
})
