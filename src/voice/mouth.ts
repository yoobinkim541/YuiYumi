// Pure mouth-open envelope. Turns a per-frame (volume, viseme weights) reading into a
// smoothed 0..1 mouth opening. Gains and attack/release rates adapted from AIRI's
// wLipSync vowel driver (templates/airi/packages/model-driver-lipsync, MIT).

export type VisemeWeights = Readonly<Partial<Record<'A' | 'E' | 'I' | 'O' | 'U' | 'S', number>>>

/** How far each viseme opens the jaw relative to "A". */
const OPENNESS = { A: 1, O: 0.85, E: 0.7, U: 0.55, I: 0.5, S: 0.15 } as const

export interface MouthEnvelope {
  update(volume: number, weights: VisemeWeights | null, deltaSec: number): number
  reset(): void
}

/** Maps log10(RMS) into 0..1 with the same bounds wLipSync uses by default. */
export function volumeFromRms(rmsValue: number, minLog = -2.5, maxLog = -1.5): number {
  if (rmsValue <= 0) return 0
  const v = (Math.log10(rmsValue) - minLog) / (maxLog - minLog)
  return Math.max(0, Math.min(1, v))
}

export function createMouthEnvelope(): MouthEnvelope {
  let value = 0
  return {
    update(volume, weights, deltaSec) {
      const amp = Math.min(Math.max(volume, 0) * 0.9, 1) ** 0.7
      let shape = 1
      if (weights) {
        let sum = 0
        let acc = 0
        for (const k of Object.keys(OPENNESS) as (keyof typeof OPENNESS)[]) {
          const w = Math.max(0, weights[k] ?? 0)
          sum += w
          acc += w * OPENNESS[k]
        }
        if (sum > 0) shape = acc / sum
      }
      const target = amp < 0.04 ? 0 : Math.min(1, amp * (0.35 + 0.65 * shape))
      const rate = 1 - Math.exp(-(target > value ? 50 : 30) * Math.max(0, deltaSec))
      value += (target - value) * rate
      if (value < 0.01) value = 0
      return value
    },
    reset() { value = 0 },
  }
}
