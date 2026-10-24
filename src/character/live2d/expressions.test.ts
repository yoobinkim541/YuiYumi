import { describe, expect, it } from 'vitest'
import type { ModelProfile } from '../model-data'
import { EMPTY_PROFILE } from '../model-data'
import type { CoreModel } from './core-model'
import { ExpressionLayer, parseExpression } from './expressions'

const profile: ModelProfile = {
  ...EMPTY_PROFILE,
  expressions: { swirl: { kind: 'emotion', no_blink: true } },
  mutex_groups: { eyes: ['cat', 'squeeze', 'swirl'], face: ['smile', 'dazed'] },
}

/** A model with a few parameters, all resting at `values`. */
function fakeCore(values: Record<string, number>): CoreModel & { values: Record<string, number> } {
  const v = { ...values }
  return {
    values: v,
    getParameterValueById: id => v[id] ?? 0,
    setParameterValueById: (id, value) => { v[id] = value },
    addParameterValueById: (id, value) => { v[id] = (v[id] ?? 0) + value },
    getParameterIndex: () => 0,
    getParameterDefaultValue: () => 0,
    getParameterMinimumValue: () => -1,
    getParameterMaximumValue: () => 1,
    getParameterCount: () => 1,
    setPartOpacityById: () => {},
  }
}

const exp = (name: string, params: [string, number, 'Add' | 'Overwrite' | 'Multiply'][], fade = 0) =>
  parseExpression(name, { FadeInTime: fade, FadeOutTime: fade, Parameters: params.map(([Id, Value, Blend]) => ({ Id, Value, Blend })) }, profile)

describe('expression layer', () => {
  it('writes Overwrites first, so another expression\'s Add lands on the held value', () => {
    const layer = new ExpressionLayer()
    // Registered Add first: applied in registration order, the Overwrite would wipe it.
    layer.add(exp('smile', [['EyeSmile', 0.5, 'Add']]))
    layer.add(exp('cat', [['EyeSmile', 0, 'Overwrite']]))
    layer.setActive(['smile', 'cat'])
    const core = fakeCore({ EyeSmile: 0.8 })
    layer.apply(core, 0.1, false)
    expect(core.values.EyeSmile).toBeCloseTo(0.5)
  })

  it('lets blinks pass under eyes held open, but not under eyes held shut or a no_blink face', () => {
    const layer = new ExpressionLayer()
    layer.add(exp('cat', [['ParamEyeLOpen', 1.1, 'Overwrite'], ['ParamEyeROpen', 1.1, 'Overwrite']]))
    layer.add(exp('squeeze', [['ParamEyeLOpen', 0, 'Overwrite'], ['ParamEyeROpen', 0, 'Overwrite']]))
    layer.add(exp('swirl', [['ParamDizzy', 1, 'Add'], ['ParamEyeLOpen', 0.8, 'Overwrite']]))
    const core = fakeCore({})
    for (const [name, held] of [['cat', false], ['squeeze', true], ['swirl', true]] as const) {
      layer.setActive([name])
      layer.apply(core, 0.1, false)
      expect(layer.blinkHold() > 0).toBe(held)
      layer.setActive([])
      layer.apply(core, 0.1, false)
    }
  })

  it('swaps drawn eyes at once, while other changes keep their fades', () => {
    const layer = new ExpressionLayer()
    layer.setGroups(profile)
    layer.add(exp('cat', [['ParamCatEyes', 1, 'Add']], 0.5))
    layer.add(exp('squeeze', [['ParamKkyu', 1, 'Add']], 0.5))
    layer.add(exp('smile', [['ParamMouthForm', 1, 'Add']], 0.5))
    const core = fakeCore({})
    layer.setActive(['cat'])
    for (let i = 0; i < 10; i++) layer.apply(core, 0.1, false)
    expect(layer.snapshot()).toEqual({ cat: 1 })

    layer.setActive(['squeeze', 'smile'])
    // The eyes swapped in full; the smile still fades in.
    expect(layer.snapshot()).toEqual({ squeeze: 1 })
    const frame = fakeCore({})
    layer.apply(frame, 0.1, false)
    expect(frame.values.ParamKkyu).toBe(1)
    expect(frame.values.ParamCatEyes ?? 0).toBe(0)
    expect(frame.values.ParamMouthForm).toBeGreaterThan(0)
    expect(frame.values.ParamMouthForm).toBeLessThan(0.5)

    // Also against eyes still fading out: they leave at once when another pair comes on.
    layer.setActive([])
    layer.apply(core, 0.1, false)
    expect(layer.snapshot().squeeze).toBeGreaterThan(0)
    layer.setActive(['cat'])
    expect(layer.snapshot().squeeze ?? 0).toBe(0)
    expect(layer.snapshot().cat).toBe(1)
  })

  it('drops at once what a newly shown Overwrite takes over', () => {
    const layer = new ExpressionLayer()
    layer.setGroups(profile)
    layer.add(exp('smile', [['ParamEyeLSmile', 1, 'Add'], ['ParamMouthForm', 1, 'Add']], 0.5))
    layer.add(exp('look', [['ParamEyeLSmile', 0, 'Overwrite']], 0))
    const core = fakeCore({})
    layer.setActive(['smile'])
    for (let i = 0; i < 10; i++) layer.apply(core, 0.1, false)
    layer.setActive(['look'])
    expect(layer.snapshot()).toEqual({ look: 1 })
  })
})
