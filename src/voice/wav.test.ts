import { describe, expect, it } from 'vitest'
import { concatFloat32, encodeWav16, resample, rms } from './wav'

describe('encodeWav16', () => {
  it('writes a valid 16 kHz mono 16-bit header and clamped samples', () => {
    const buf = encodeWav16(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16000)
    const v = new DataView(buf)
    const str = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n))
    expect(buf.byteLength).toBe(44 + 12)
    expect(str(0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(36 + 12)
    expect(str(8, 4)).toBe('WAVE')
    expect(str(12, 4)).toBe('fmt ')
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(28, true)).toBe(32000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(str(36, 4)).toBe('data')
    expect(v.getUint32(40, true)).toBe(12)
    const pcm = [0, 1, 2, 3, 4, 5].map(i => v.getInt16(44 + i * 2, true))
    expect(pcm).toEqual([0, 32767, -32768, 32767, -32768, 16384])
  })
})

describe('resample', () => {
  it('returns a copy when rates match', () => {
    const a = new Float32Array([1, 2, 3])
    const b = resample(a, 16000, 16000)
    expect(Array.from(b)).toEqual([1, 2, 3])
    expect(b).not.toBe(a)
  })

  it('downsamples 48k -> 16k by averaging groups of three', () => {
    const a = new Float32Array([0, 0.3, 0.6, 1, 1, 1, -1, -1, -1])
    const b = resample(a, 48000, 16000)
    expect(b.length).toBe(3)
    expect(b[0]).toBeCloseTo(0.3)
    expect(b[1]).toBeCloseTo(1)
    expect(b[2]).toBeCloseTo(-1)
  })

  it('keeps duration for non-integer ratios (44.1k -> 16k)', () => {
    const b = resample(new Float32Array(44100), 44100, 16000)
    expect(b.length).toBe(16000)
  })

  it('upsamples with linear interpolation', () => {
    const b = resample(new Float32Array([0, 1]), 8000, 16000)
    expect(Array.from(b)).toEqual([0, 0.5, 1, 1])
  })
})

describe('concatFloat32 / rms', () => {
  it('concatenates chunks in order', () => {
    const c = concatFloat32([new Float32Array([1]), new Float32Array([2, 3])])
    expect(Array.from(c)).toEqual([1, 2, 3])
  })
  it('computes RMS', () => {
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1)
    expect(rms(new Float32Array())).toBe(0)
  })
})
