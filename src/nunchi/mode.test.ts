import { describe, expect, it } from 'vitest'
import { DialogueLog } from './dialogue'
import { isObserving, modeAfterTranscript, toggledMode } from './mode'
import { routeActions } from './scheduler'

describe('mode', () => {
  it('wakes from quiet/ornamental on a non-empty transcript', () => {
    expect(modeAfterTranscript('quiet', 'hi')).toBe('active')
    expect(modeAfterTranscript('ornamental', 'あ')).toBe('active')
    expect(modeAfterTranscript('active', 'hi')).toBe('active')
  })
  it('keeps the mode on an empty transcript', () => {
    expect(modeAfterTranscript('quiet', '')).toBe('quiet')
    expect(modeAfterTranscript('ornamental', '   ')).toBe('ornamental')
  })
  it('toggles active <-> quiet', () => {
    expect(toggledMode('active')).toBe('quiet')
    expect(toggledMode('quiet')).toBe('active')
    expect(toggledMode('ornamental')).toBe('active')
    expect(isObserving('active')).toBe(true)
    expect(isObserving('quiet')).toBe(false)
  })
})

describe('routeActions', () => {
  it('maps react and delegate_task with origin', () => {
    const ev = routeActions([
      { type: 'react', emotion: 'happy', line: 'Hi!' },
      { type: 'delegate_task', request: 'Draft a reply' },
    ], 'screen')
    expect(ev).toEqual([
      { type: 'character:react', payload: { emotion: 'happy', line: 'Hi!', motion: undefined, source: 'observer' } },
      { type: 'agent:delegate', payload: { request: 'Draft a reply', origin: 'screen' } },
    ])
  })
})

describe('DialogueLog', () => {
  it('keeps the last 10 non-empty turns', () => {
    const d = new DialogueLog()
    for (let i = 0; i < 14; i++) d.push(i % 2 ? 'assistant' : 'user', `t${i}`)
    d.push('user', '   ')
    const r = d.recent()
    expect(r).toHaveLength(10)
    expect(r[0]!.text).toBe('t4')
    expect(r[9]!.text).toBe('t13')
  })
})
