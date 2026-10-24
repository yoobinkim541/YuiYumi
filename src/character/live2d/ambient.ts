// Ambient loops: motion3 files that run under every other motion and write only their
// own curves (tear flow, sweat, the tail wag). Sampled here rather than through the SDK
// motion manager, which plays one motion at a time.

import type { CoreModel } from './core-model'

interface Segment {
  /** 0 linear, 1 bezier, 2 stepped, 3 inverse stepped. */
  kind: number
  t0: number
  v0: number
  /** Bezier control points (time, value) x2 then the end point; otherwise just the end point. */
  points: number[]
}

interface AmbientCurve {
  target: 'Parameter' | 'PartOpacity'
  id: string
  segments: Segment[]
}

export interface AmbientMotion {
  duration: number
  restrictedBeziers: boolean
  curves: AmbientCurve[]
  /** Parameter whose value (clamped to 0..1) scales the loop's offset from rest. */
  gate?: string
}

const POINTS = [1, 3, 1, 1]

function parseSegments(raw: number[]): Segment[] {
  const segments: Segment[] = []
  let t0 = raw[0]
  let v0 = raw[1]
  for (let i = 2; i < raw.length;) {
    const kind = raw[i]
    const n = POINTS[kind]
    if (n === undefined || i + 2 * n >= raw.length) throw new Error(`motion3: bad segment marker ${kind} at ${i}`)
    const points = raw.slice(i + 1, i + 1 + 2 * n)
    segments.push({ kind, t0, v0, points })
    t0 = points[points.length - 2]
    v0 = points[points.length - 1]
    i += 1 + 2 * n
  }
  return segments
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAmbientMotion(json: any, gate?: string): AmbientMotion {
  const curves: AmbientCurve[] = []
  for (const c of json?.Curves ?? []) {
    if ((c.Target !== 'Parameter' && c.Target !== 'PartOpacity') || !Array.isArray(c.Segments) || c.Segments.length < 2) continue
    curves.push({ target: c.Target, id: c.Id, segments: parseSegments(c.Segments) })
  }
  return {
    duration: Math.max(Number(json?.Meta?.Duration) || 0, 0),
    restrictedBeziers: json?.Meta?.AreBeziersRestricted === true,
    curves,
    ...(gate ? { gate } : {}),
  }
}

function cubic(a: number, b: number, c: number, d: number, s: number) {
  return (1 - s) ** 3 * a + 3 * (1 - s) ** 2 * s * b + 3 * (1 - s) * s * s * c + s ** 3 * d
}

/** Curve value at `t` seconds, as the Cubism SDK evaluates it. */
function sampleCurve(curve: AmbientCurve, t: number, restrictedBeziers: boolean): number {
  const { segments } = curve
  if (segments.length === 0 || t <= segments[0].t0) return segments[0]?.v0 ?? 0
  const seg = segments.find(s => t < s.points[s.points.length - 2]) ?? segments[segments.length - 1]
  const t1 = seg.points[seg.points.length - 2]
  const v1 = seg.points[seg.points.length - 1]
  if (t >= t1) return v1
  switch (seg.kind) {
    case 0: return seg.v0 + (v1 - seg.v0) * (t - seg.t0) / (t1 - seg.t0)
    case 2: return seg.v0
    case 3: return v1
    default: {
      const [c1t, c1v, c2t, c2v] = seg.points
      let s = (t - seg.t0) / (t1 - seg.t0)
      if (!restrictedBeziers) {
        let lo = 0
        let hi = 1
        for (let k = 0; k < 30; k++) {
          s = (lo + hi) / 2
          if (cubic(seg.t0, c1t, c2t, t1, s) < t) lo = s
          else hi = s
        }
      }
      return cubic(seg.v0, c1v, c2v, v1, s)
    }
  }
}

/** Writes every ambient loop for time `nowSec`. A gated loop moves its parameters from their default by the gate value. */
export function applyAmbient(core: CoreModel, motions: readonly AmbientMotion[], nowSec: number): void {
  for (const m of motions) {
    if (m.duration <= 0 || m.curves.length === 0) continue
    const weight = m.gate === undefined ? 1 : Math.min(1, Math.max(0, core.getParameterValueById(m.gate)))
    const t = nowSec % m.duration
    for (const curve of m.curves) {
      const value = sampleCurve(curve, t, m.restrictedBeziers)
      if (curve.target === 'PartOpacity') {
        core.setPartOpacityById(curve.id, 1 + (value - 1) * weight)
      }
      else {
        const rest = weight === 1 ? 0 : core.getParameterDefaultValue(core.getParameterIndex(curve.id))
        core.setParameterValueById(curve.id, rest + (value - rest) * weight)
      }
    }
  }
}
