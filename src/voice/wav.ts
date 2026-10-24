// Pure PCM helpers: concat, resample, 16-bit WAV encoding. No DOM access.

export const STT_SAMPLE_RATE = 16_000

export function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

/**
 * Resamples mono PCM. Downsampling averages the source samples that fall into each
 * output sample (a box filter, enough to tame aliasing for speech); upsampling uses
 * linear interpolation.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input.slice()
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLength)
  if (ratio > 1) {
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.min(input.length, Math.floor((i + 1) * ratio))
      let sum = 0
      for (let j = start; j < end; j++) sum += input[j]!
      out[i] = end > start ? sum / (end - start) : input[start] ?? 0
    }
  } else {
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio
      const i0 = Math.floor(pos)
      const i1 = Math.min(input.length - 1, i0 + 1)
      const t = pos - i0
      out[i] = input[i0]! * (1 - t) + input[i1]! * t
    }
  }
  return out
}

/** Encodes mono Float32 samples (-1..1) as a 16-bit little-endian PCM WAV file. */
export function encodeWav16(samples: Float32Array, sampleRate = STT_SAMPLE_RATE): ArrayBuffer {
  const dataBytes = samples.length * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const v = new DataView(buf)
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true) // PCM chunk size
  v.setUint16(20, 1, true) // PCM format
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  v.setUint32(40, dataBytes, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    v.setInt16(off, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
  }
  return buf
}

/** Root mean square of a buffer; used to skip silent push-to-talk takes. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!
  return Math.sqrt(sum / samples.length)
}
