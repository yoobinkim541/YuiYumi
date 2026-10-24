// Expression layer: several exp3 expressions blended at once, each with its own fade.
// Replaces the SDK expression manager, which holds a single expression.
//
// Composition rules follow the model profile: two members of one mutex group never show
// together (the later one in a list wins), and `hides_mouth` expressions step aside
// while the mouth layer is speaking.

import type { CoreModel } from './core-model'
import type { ModelProfile } from '../model-data'

type Blend = 'Add' | 'Multiply' | 'Overwrite'

export interface ExpressionDef {
  name: string
  params: { id: string, value: number, blend: Blend }[]
  fadeIn: number
  fadeOut: number
  hidesMouth: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseExpression(rawName: string, json: any, profile: ModelProfile): ExpressionDef {
  // Names are compared in NFC: exp3 file names on macOS may be NFD-decomposed Hangul.
  const name = rawName.normalize('NFC')
  const meta = profile.expressions[name] ?? {}
  return {
    name,
    params: (json?.Parameters ?? []).map((p: { Id: string, Value: number, Blend?: Blend }) => ({
      id: p.Id,
      value: Number(p.Value) || 0,
      blend: p.Blend ?? 'Add',
    })),
    fadeIn: meta.fade_in_s ?? (Number.isFinite(json?.FadeInTime) ? json.FadeInTime : 0.5),
    fadeOut: meta.fade_out_s ?? (Number.isFinite(json?.FadeOutTime) ? json.FadeOutTime : 0.5),
    hidesMouth: meta.hides_mouth === true,
  }
}

/** Resolves a list of expression names against the mutex groups: a later member replaces an earlier one. */
export function composeExpressions(names: readonly string[], profile: ModelProfile, known: ReadonlySet<string>): string[] {
  const groupOf = new Map<string, string>()
  for (const [group, members] of Object.entries(profile.mutex_groups)) {
    for (const m of members) groupOf.set(m.normalize('NFC'), group)
  }
  const out: string[] = []
  for (const raw of names) {
    const name = raw.normalize('NFC')
    if (!known.has(name)) continue
    const group = groupOf.get(name)
    if (group) {
      const clash = out.findIndex(n => groupOf.get(n) === group)
      if (clash >= 0) out.splice(clash, 1)
    }
    if (!out.includes(name)) out.push(name)
  }
  return out
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export class ExpressionLayer {
  private defs = new Map<string, ExpressionDef>()
  private weights = new Map<string, number>()
  private active = new Set<string>()

  add(def: ExpressionDef): void {
    this.defs.set(def.name, def)
  }

  names(): ReadonlySet<string> {
    return new Set(this.defs.keys())
  }

  /** Current fade weights of the expressions that are on or fading. */
  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.weights].filter(([, w]) => w > 0))
  }

  setActive(names: readonly string[]): void {
    this.active = new Set(names.filter(n => this.defs.has(n)))
  }

  /** Advances the fades by `dt` seconds and blends the expressions onto the current parameters. */
  apply(core: CoreModel, dt: number, mouthActive: boolean): void {
    for (const [name, def] of this.defs) {
      const on = this.active.has(name) && !(def.hidesMouth && mouthActive)
      let w = this.weights.get(name) ?? 0
      if (on && w < 1) w = Math.min(1, w + (def.fadeIn > 0 ? dt / def.fadeIn : 1))
      else if (!on && w > 0) {
        // A mouth-hiding expression clears quickly when speech starts so lip-sync shows at once.
        const fadeOut = def.hidesMouth && mouthActive ? Math.min(def.fadeOut, 0.12) : def.fadeOut
        w = Math.max(0, w - (fadeOut > 0 ? dt / fadeOut : 1))
      }
      this.weights.set(name, w)
      if (w <= 0) continue
      const k = smooth(w)
      for (const p of def.params) {
        const v = core.getParameterValueById(p.id)
        if (p.blend === 'Multiply') core.setParameterValueById(p.id, v * (1 + (p.value - 1) * k))
        else if (p.blend === 'Overwrite') core.setParameterValueById(p.id, v + (p.value - v) * k)
        else core.setParameterValueById(p.id, v + p.value * k)
      }
    }
  }
}
