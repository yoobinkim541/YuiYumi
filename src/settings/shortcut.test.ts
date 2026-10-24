import { describe, expect, it } from 'vitest'
import {
  captureShortcut, DEFAULT_PTT, endsShortcut, formatShortcut, keyName, matchesShortcut, parseShortcut, shortcutCaps,
  type KeyLike,
} from './shortcut'

function key(code: string, mods: Partial<Omit<KeyLike, 'code'>> = {}): KeyLike {
  return { code, key: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }
}

describe('captureShortcut', () => {
  it('waits while only modifiers are pressed', () => {
    expect(captureShortcut(key('AltLeft', { altKey: true }))).toEqual({ kind: 'wait' })
    expect(captureShortcut(key('MetaRight', { metaKey: true }))).toEqual({ kind: 'wait' })
    expect(captureShortcut(key('ShiftLeft', { shiftKey: true }))).toEqual({ kind: 'wait' })
  })

  it('cancels on Escape', () => {
    expect(captureShortcut(key('Escape'))).toEqual({ kind: 'cancel' })
    expect(captureShortcut(key('Escape', { altKey: true }))).toEqual({ kind: 'cancel' })
  })

  it('accepts plain Space and function keys', () => {
    expect(captureShortcut(key('Space'))).toEqual({ kind: 'ok', shortcut: { code: 'Space' } })
    expect(captureShortcut(key('F8'))).toEqual({ kind: 'ok', shortcut: { code: 'F8' } })
  })

  it('rejects plain letters, digits and typing keys', () => {
    for (const code of ['KeyT', 'Digit5', 'Numpad3', 'Enter', 'Tab', 'Backspace', 'Slash'])
      expect(captureShortcut(key(code)).kind).toBe('reject')
  })

  it('rejects Shift alone as the modifier for a letter', () => {
    expect(captureShortcut(key('KeyT', { shiftKey: true })).kind).toBe('reject')
  })

  it('accepts letters and digits with Ctrl, Alt or Meta and keeps only true flags', () => {
    expect(captureShortcut(key('KeyT', { altKey: true }))).toEqual({ kind: 'ok', shortcut: { code: 'KeyT', alt: true } })
    expect(captureShortcut(key('Digit1', { ctrlKey: true, shiftKey: true })))
      .toEqual({ kind: 'ok', shortcut: { code: 'Digit1', ctrl: true, shift: true } })
    expect(captureShortcut(key('KeyM', { metaKey: true }))).toEqual({ kind: 'ok', shortcut: { code: 'KeyM', meta: true } })
  })
})

describe('parseShortcut', () => {
  it('restores valid stored values and drops invalid ones', () => {
    expect(parseShortcut({ code: 'KeyT', alt: true })).toEqual({ code: 'KeyT', alt: true })
    expect(parseShortcut({ code: 'Space' })).toEqual(DEFAULT_PTT)
    expect(parseShortcut({ code: 'KeyT' })).toBeNull()
    expect(parseShortcut({ code: 'AltLeft', alt: true })).toBeNull()
    expect(parseShortcut('Space')).toBeNull()
    expect(parseShortcut(undefined)).toBeNull()
  })
})

describe('matchesShortcut', () => {
  it('matches the main key with exactly the configured modifiers', () => {
    const s = { code: 'KeyT', alt: true }
    expect(matchesShortcut(key('KeyT', { altKey: true }), s)).toBe(true)
    expect(matchesShortcut(key('KeyT'), s)).toBe(false)
    expect(matchesShortcut(key('KeyT', { altKey: true, shiftKey: true }), s)).toBe(false)
    expect(matchesShortcut(key('KeyR', { altKey: true }), s)).toBe(false)
  })

  it('matches Space by code or by key', () => {
    expect(matchesShortcut(key('Space'), DEFAULT_PTT)).toBe(true)
    expect(matchesShortcut({ ...key(''), key: ' ' }, DEFAULT_PTT)).toBe(true)
    expect(matchesShortcut(key('Space', { ctrlKey: true }), DEFAULT_PTT)).toBe(false)
  })
})

describe('endsShortcut', () => {
  it('ends on the main key or a required modifier', () => {
    const s = { code: 'KeyT', meta: true }
    expect(endsShortcut(key('KeyT'), s)).toBe(true)
    expect(endsShortcut(key('MetaLeft'), s)).toBe(true)
    expect(endsShortcut(key('AltLeft'), s)).toBe(false)
    expect(endsShortcut(key('KeyR'), s)).toBe(false)
  })
})

describe('formatting', () => {
  it('names keys from their codes', () => {
    expect(keyName('KeyT')).toBe('T')
    expect(keyName('Digit7')).toBe('7')
    expect(keyName('Space')).toBe('Space')
    expect(keyName('ArrowUp')).toBe('↑')
    expect(keyName('Numpad5')).toBe('Num 5')
    expect(keyName('F9')).toBe('F9')
  })

  it('uses macOS symbols in Apple order', () => {
    const s = { code: 'KeyT', meta: true, shift: true, alt: true, ctrl: true }
    expect(shortcutCaps(s, true)).toEqual(['⌃', '⌥', '⇧', '⌘', 'T'])
    expect(formatShortcut({ code: 'KeyT', alt: true }, true)).toBe('⌥ T')
    expect(formatShortcut(DEFAULT_PTT, true)).toBe('Space')
  })

  it('uses words joined by + elsewhere', () => {
    expect(formatShortcut({ code: 'KeyT', ctrl: true, alt: true }, false)).toBe('Ctrl+Alt+T')
    expect(formatShortcut({ code: 'KeyM', meta: true }, false)).toBe('Win+M')
  })
})
