// Push-to-talk shortcut: a KeyboardEvent.code plus optional modifiers. Pure helpers for
// capturing, validating, matching and displaying it (no DOM or store access).

export interface Shortcut {
  /** KeyboardEvent.code of the main key, e.g. 'Space' or 'KeyT'. */
  code: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

/** The subset of KeyboardEvent the helpers read. */
export interface KeyLike {
  code: string
  key?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export const DEFAULT_PTT: Shortcut = { code: 'Space' }

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'Fn', 'FnLock',
])

/** Keys that type into the virtual desktop; they need Ctrl, Alt or Meta to be a shortcut. */
const TYPING_CODES = /^(Key[A-Z]|Digit\d|Numpad(\d|Decimal|Add|Subtract|Multiply|Divide|Enter)|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen|Enter|Tab|Backspace|Delete)$/

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code)
}

/** Ctrl, Alt or Meta held. Shift alone does not count: Shift+T still types a letter. */
export function hasCommandModifier(s: Pick<Shortcut, 'ctrl' | 'alt' | 'meta'>): boolean {
  return !!(s.ctrl || s.alt || s.meta)
}

export type CaptureResult =
  | { kind: 'wait' }
  | { kind: 'cancel' }
  | { kind: 'reject', reason: string }
  | { kind: 'ok', shortcut: Shortcut }

/** Interprets one keydown while the "Record shortcut" button is armed. */
export function captureShortcut(e: KeyLike): CaptureResult {
  if (!e.code || isModifierCode(e.code)) return { kind: 'wait' }
  if (e.code === 'Escape') return { kind: 'cancel' }
  const shortcut = normalizeShortcut({ code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey })
  if (!hasCommandModifier(shortcut) && TYPING_CODES.test(shortcut.code))
    return { kind: 'reject', reason: 'Letters, digits and typing keys need Ctrl, Alt or Cmd.' }
  return { kind: 'ok', shortcut }
}

/** Drops false modifier flags so stored values compare and serialize cleanly. */
export function normalizeShortcut(s: Shortcut): Shortcut {
  const out: Shortcut = { code: s.code }
  if (s.ctrl) out.ctrl = true
  if (s.alt) out.alt = true
  if (s.shift) out.shift = true
  if (s.meta) out.meta = true
  return out
}

/** Accepts a persisted value only if it is a shortcut the recorder could have produced. */
export function parseShortcut(raw: unknown): Shortcut | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.code !== 'string' || !r.code) return null
  const res = captureShortcut({
    code: r.code, ctrlKey: r.ctrl === true, altKey: r.alt === true, shiftKey: r.shift === true, metaKey: r.meta === true,
  })
  return res.kind === 'ok' ? res.shortcut : null
}

function isMainKey(e: KeyLike, s: Shortcut): boolean {
  return e.code === s.code || (s.code === 'Space' && e.key === ' ')
}

/** Keydown that starts push-to-talk: main key with exactly the configured modifiers. */
export function matchesShortcut(e: KeyLike, s: Shortcut): boolean {
  return isMainKey(e, s)
    && e.ctrlKey === !!s.ctrl && e.altKey === !!s.alt && e.shiftKey === !!s.shift && e.metaKey === !!s.meta
}

/**
 * Keyup that ends push-to-talk: the main key, or one of the required modifiers (macOS
 * does not deliver keyup for other keys while Cmd is held).
 */
export function endsShortcut(e: KeyLike, s: Shortcut): boolean {
  if (isMainKey(e, s)) return true
  const c = e.code
  return (!!s.ctrl && (c === 'ControlLeft' || c === 'ControlRight'))
    || (!!s.alt && (c === 'AltLeft' || c === 'AltRight'))
    || (!!s.shift && (c === 'ShiftLeft' || c === 'ShiftRight'))
    || (!!s.meta && (c === 'MetaLeft' || c === 'MetaRight' || c === 'OSLeft' || c === 'OSRight'))
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Del',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: '\'', Backquote: '`', Comma: ',', Period: '.', Slash: '/', ContextMenu: 'Menu',
}

/** Display name of a KeyboardEvent.code. */
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  let m = /^Key([A-Z])$/.exec(code)
  if (m) return m[1]
  m = /^Digit(\d)$/.exec(code)
  if (m) return m[1]
  m = /^Numpad(.+)$/.exec(code)
  if (m) return `Num ${KEY_NAMES[m[1]] ?? m[1]}`
  return code
}

/** Key caps in platform order, e.g. ['⌥', 'T'] on macOS or ['Ctrl', 'Alt', 'T'] elsewhere. */
export function shortcutCaps(s: Shortcut, mac: boolean): string[] {
  const caps: string[] = []
  if (mac) {
    if (s.ctrl) caps.push('⌃')
    if (s.alt) caps.push('⌥')
    if (s.shift) caps.push('⇧')
    if (s.meta) caps.push('⌘')
  } else {
    if (s.ctrl) caps.push('Ctrl')
    if (s.alt) caps.push('Alt')
    if (s.shift) caps.push('Shift')
    if (s.meta) caps.push('Win')
  }
  caps.push(keyName(s.code))
  return caps
}

/** One-line label, e.g. '⌥ T', 'Ctrl+Alt+T' or 'Space'. */
export function formatShortcut(s: Shortcut, mac: boolean): string {
  return shortcutCaps(s, mac).join(mac ? ' ' : '+')
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '')
}
