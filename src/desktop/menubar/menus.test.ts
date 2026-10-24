import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/settings', () => ({ useSettings: () => ({ lang: 'en' }) }))

const { buildMenus, formatShortcut, shortcutAction } = await import('./menus')
const { monthGrid, rangeFill, todaysEvents } = await import('./panels')
const { desktopStrings } = await import('../i18n')

type Ctx = Parameters<typeof buildMenus>[0]

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    app: 'mail',
    appName: 'Mail',
    windows: [
      { id: 'mail', title: 'Mail — Inbox', focused: true, assistant: false },
      { id: 'calendar', title: 'Calendar — Today', focused: false, assistant: false },
    ],
    hasFocusedWindow: true,
    edit: { editable: false, hasSelection: false },
    mail: { folder: 'inbox', sidebar: true, canReply: true },
    user: 'Hana',
    ...over,
  }
}

const key = (k: string, mods: Partial<{ metaKey: boolean, ctrlKey: boolean, shiftKey: boolean, altKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods })

describe('formatShortcut', () => {
  it('orders modifiers like macOS', () => {
    expect(formatShortcut({ key: 'q', cmd: true, ctrl: true })).toBe('⌃⌘Q')
    expect(formatShortcut({ key: 'z', cmd: true, shift: true })).toBe('⇧⌘Z')
    expect(formatShortcut({ key: 'h', cmd: true, alt: true })).toBe('⌥⌘H')
    expect(formatShortcut({ key: ',', cmd: true })).toBe('⌘,')
  })
})

describe('buildMenus', () => {
  const t = desktopStrings('en')

  it('starts with the system menu and the bold app menu', () => {
    const menus = buildMenus(ctx(), t)
    expect(menus.map(m => m.id)).toEqual(['system', 'app', 'file', 'edit', 'view', 'mailbox', 'message', 'window', 'help'])
    expect(menus[1]).toMatchObject({ title: 'Mail', bold: true })
  })

  it('wires Mail > File > New Message', () => {
    const file = buildMenus(ctx(), t).find(m => m.id === 'file')!
    expect(file.entries[0]).toMatchObject({ label: 'New Message', action: 'mail:new', disabled: false })
  })

  it('lists open windows in the Window menu and checks the focused one', () => {
    const win = buildMenus(ctx(), t).find(m => m.id === 'window')!
    const rows = win.entries.filter(e => e.kind === 'item' && e.action?.startsWith('focus:'))
    expect(rows).toEqual([
      expect.objectContaining({ label: 'Mail — Inbox', action: 'focus:mail', checked: true }),
      expect.objectContaining({ label: 'Calendar — Today', action: 'focus:calendar', checked: false }),
    ])
  })

  it('disables edit commands outside text fields', () => {
    const edit = buildMenus(ctx(), t).find(m => m.id === 'edit')!
    const byLabel = (l: string) => edit.entries.find(e => e.kind === 'item' && e.label === l)
    expect(byLabel('Undo')).toMatchObject({ disabled: true })
    expect(byLabel('Copy')).toMatchObject({ disabled: true })
    const editing = buildMenus(ctx({ edit: { editable: true, hasSelection: true } }), t).find(m => m.id === 'edit')!
    expect(editing.entries.filter(e => e.kind === 'item' && !e.disabled).map(e => e.kind === 'item' && e.action))
      .toEqual(['edit:undo', 'edit:redo', 'edit:cut', 'edit:copy', 'edit:paste', 'edit:selectAll'])
  })

  it('uses Day / Week / Month in Calendar with only Day enabled', () => {
    const view = buildMenus(ctx({ app: 'calendar', appName: 'Calendar' }), t).find(m => m.id === 'view')!
    const rows = view.entries.filter(e => e.kind === 'item').slice(0, 3)
    expect(rows.map(e => e.kind === 'item' && [e.label, !!e.disabled])).toEqual([['Day', false], ['Week', true], ['Month', true]])
  })

  it('hides the assistant from captures', () => {
    const menus = buildMenus(ctx({
      app: 'assistant', appName: 'YuiYumi',
      windows: [{ id: 'settings', title: 'YuiYumi Settings', focused: true, assistant: true }],
    }), t)
    expect(menus[1]!.noCapture).toBe(true)
    const win = menus.find(m => m.id === 'window')!
    expect(win.entries.find(e => e.kind === 'item' && e.action === 'focus:settings')).toMatchObject({ noCapture: true })
  })

  it('disables window commands when nothing is focused (Finder)', () => {
    const menus = buildMenus(ctx({ app: 'finder', appName: 'Finder', hasFocusedWindow: false }), t)
    const file = menus.find(m => m.id === 'file')!
    expect(file.entries.find(e => e.kind === 'item' && e.label === 'Close Window')).toMatchObject({ disabled: true })
  })
})

describe('shortcutAction', () => {
  const base = { app: 'mail' as const, editable: false, hasFocusedWindow: true }

  it('maps Cmd or Ctrl shortcuts', () => {
    expect(shortcutAction(key('n', { metaKey: true }), base)).toBe('mail:new')
    expect(shortcutAction(key('n', { ctrlKey: true }), base)).toBe('mail:new')
    expect(shortcutAction(key('w', { metaKey: true }), base)).toBe('win:close')
    expect(shortcutAction(key('m', { metaKey: true }), base)).toBe('win:minimize')
    expect(shortcutAction(key('2', { metaKey: true }), base)).toBe('mail:folder:drafts')
  })

  it('ignores plain keys, typing in fields and other apps', () => {
    expect(shortcutAction(key('n'), base)).toBeNull()
    expect(shortcutAction(key('n', { metaKey: true }), { ...base, editable: true })).toBeNull()
    expect(shortcutAction(key('n', { metaKey: true }), { ...base, app: 'slack' })).toBeNull()
    expect(shortcutAction(key('w', { metaKey: true }), { ...base, hasFocusedWindow: false })).toBeNull()
    expect(shortcutAction(key('z', { metaKey: true, shiftKey: true }), base)).toBeNull()
  })
})

describe('localized menus', () => {
  it('builds every language without missing labels', () => {
    for (const lang of ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const) {
      const menus = buildMenus(ctx(), desktopStrings(lang))
      for (const m of menus.slice(1)) expect(m.title).toBeTruthy()
      for (const m of menus) for (const e of m.entries) if (e.kind === 'item') expect(e.label).toBeTruthy()
    }
  })
})

describe('panels helpers', () => {
  it('pads the month grid to the first weekday', () => {
    const g = monthGrid(new Date(2026, 9, 24)) // October 2026 starts on a Thursday
    expect(g.slice(0, 5)).toEqual([0, 0, 0, 0, 1])
    expect(g.at(-1)).toBe(31)
  })

  it('keeps only today\'s events in start order', () => {
    const now = new Date(2026, 9, 24, 12)
    const iso = (h: number, d = 24) => new Date(2026, 9, d, h).toISOString()
    const evs = todaysEvents([
      { id: 'b', title: 'B', start: iso(15), end: iso(16) },
      { id: 'x', title: 'X', start: iso(9, 25), end: iso(10, 25) },
      { id: 'a', title: 'A', start: iso(9), end: iso(10) },
    ], now)
    expect(evs.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('clamps range fill', () => {
    expect(rangeFill(0.35, 0.35, 1)).toBe(0)
    expect(rangeFill(1, 0.35, 1)).toBe(100)
    expect(rangeFill(2, 0, 1)).toBe(100)
  })
})
