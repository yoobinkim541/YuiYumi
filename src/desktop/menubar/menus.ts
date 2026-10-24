// Menu model for the virtual desktop's macOS-style menu bar. Pure functions: the menu bar
// component turns the action strings into window/app commands.

import type { DesktopStrings, MenuBarStrings } from '../i18n'
import type { AppId, UserAppId } from '../windows'
import type { MailFolder } from './bridge'

export interface Shortcut { key: string, cmd?: boolean, shift?: boolean, alt?: boolean, ctrl?: boolean }

export type MenuEntry =
  | { kind: 'sep' }
  | { kind: 'item', label: string, action?: string, shortcut?: Shortcut, disabled?: boolean, checked?: boolean, noCapture?: boolean }
  | { kind: 'search', placeholder: string }

export interface MenuDef {
  id: string
  title: string
  bold?: boolean
  /** Rendered (title and dropdown) with [data-no-capture]. */
  noCapture?: boolean
  entries: MenuEntry[]
}

export type MenuApp = UserAppId | 'finder' | 'assistant'

export interface MenuWindow { id: AppId, title: string, focused: boolean, assistant: boolean }

export interface MenuContext {
  app: MenuApp
  /** Localized name shown in bold next to the system menu. */
  appName: string
  /** Open windows in display order. */
  windows: MenuWindow[]
  hasFocusedWindow: boolean
  edit: { editable: boolean, hasSelection: boolean }
  mail?: { folder: MailFolder, sidebar: boolean, canReply: boolean }
  user: string
}

const MOD_ORDER: [keyof Shortcut, string][] = [['ctrl', '⌃'], ['alt', '⌥'], ['shift', '⇧'], ['cmd', '⌘']]

/** macOS shortcut hint, modifiers in the system order: "⌃⌥⇧⌘K". */
export function formatShortcut(s: Shortcut): string {
  const mods = MOD_ORDER.filter(([k]) => s[k]).map(([, g]) => g).join('')
  const key = s.key === ',' ? ',' : s.key.length === 1 ? s.key.toUpperCase() : s.key
  return mods + key
}

const sc = (key: string, mods: Omit<Shortcut, 'key'> = { cmd: true }): Shortcut => ({ key, ...mods })
const sep: MenuEntry = { kind: 'sep' }
function item(label: string, action?: string, extra: Partial<Extract<MenuEntry, { kind: 'item' }>> = {}): MenuEntry {
  return { kind: 'item', label, action, disabled: !action, ...extra }
}

export function systemMenu(m: MenuBarStrings, user: string): MenuDef {
  return {
    id: 'system',
    title: '',
    entries: [
      item(m.aboutPC, 'sys:about'),
      sep,
      item(m.systemSettings, 'sys:settings'),
      sep,
      item(m.sleep, 'sys:sleep'),
      item(m.restart, 'sys:restart'),
      item(m.shutDown),
      sep,
      item(m.lockScreen, 'sys:lock', { shortcut: sc('Q', { ctrl: true, cmd: true }) }),
      item(m.logOut(user), undefined, { shortcut: sc('Q', { shift: true, cmd: true }) }),
    ],
  }
}

function appMenu(ctx: MenuContext, m: MenuBarStrings): MenuDef {
  const name = ctx.appName
  const isFinder = ctx.app === 'finder'
  return {
    id: 'app',
    title: name,
    bold: true,
    noCapture: ctx.app === 'assistant',
    entries: [
      item(m.about(name), 'app:about'),
      sep,
      item(m.settings, undefined, { shortcut: sc(',') }),
      sep,
      item(m.hide(name), ctx.hasFocusedWindow && !isFinder ? 'app:hide' : undefined, { shortcut: sc('H') }),
      item(m.hideOthers, ctx.windows.some(w => !w.focused && !w.assistant) ? 'app:hideOthers' : undefined, { shortcut: sc('H', { alt: true, cmd: true }) }),
      item(m.showAll),
      ...(isFinder ? [] : [sep, item(m.quit(name), ctx.hasFocusedWindow ? 'app:quit' : undefined, { shortcut: sc('Q') })]),
    ],
  }
}

function editMenu(ctx: MenuContext, m: MenuBarStrings): MenuDef {
  const { editable, hasSelection } = ctx.edit
  return {
    id: 'edit',
    title: m.edit,
    entries: [
      item(m.undo, editable ? 'edit:undo' : undefined, { shortcut: sc('Z') }),
      item(m.redo, editable ? 'edit:redo' : undefined, { shortcut: sc('Z', { shift: true, cmd: true }) }),
      sep,
      item(m.cut, editable && hasSelection ? 'edit:cut' : undefined, { shortcut: sc('X') }),
      item(m.copy, hasSelection ? 'edit:copy' : undefined, { shortcut: sc('C') }),
      item(m.paste, editable ? 'edit:paste' : undefined, { shortcut: sc('V') }),
      item(m.selectAll, editable ? 'edit:selectAll' : undefined, { shortcut: sc('A') }),
      sep,
      item(m.find, undefined, { shortcut: sc('F') }),
    ],
  }
}

function windowMenu(ctx: MenuContext, m: MenuBarStrings): MenuDef {
  const f = ctx.hasFocusedWindow
  return {
    id: 'window',
    title: m.window,
    entries: [
      item(m.minimize, f ? 'win:minimize' : undefined, { shortcut: sc('M') }),
      item(m.zoom, f ? 'win:zoom' : undefined),
      sep,
      item(m.bringAllToFront, ctx.windows.length ? 'win:front' : undefined),
      ...(ctx.windows.length ? [sep] : []),
      ...ctx.windows.map(w => item(w.title, `focus:${w.id}`, { checked: w.focused, noCapture: w.assistant })),
    ],
  }
}

function helpMenu(ctx: MenuContext, m: MenuBarStrings): MenuDef {
  return {
    id: 'help',
    title: m.help,
    entries: [
      { kind: 'search', placeholder: m.search },
      item(m.appHelp(ctx.app === 'assistant' ? 'Finder' : ctx.appName)),
    ],
  }
}

function closeItem(ctx: MenuContext, m: MenuBarStrings): MenuEntry {
  return item(m.closeWindow, ctx.hasFocusedWindow ? 'win:close' : undefined, { shortcut: sc('W') })
}

function fullScreenItem(ctx: MenuContext, m: MenuBarStrings): MenuEntry {
  return item(m.enterFullScreen, ctx.hasFocusedWindow ? 'win:zoom' : undefined, { shortcut: sc('F', { ctrl: true, cmd: true }) })
}

function mailMenus(ctx: MenuContext, t: DesktopStrings): MenuDef[] {
  const m = t.mb
  const mail = ctx.mail ?? { folder: 'inbox', sidebar: true, canReply: false }
  return [
    { id: 'file', title: m.file, entries: [
      item(m.newMessage, 'mail:new', { shortcut: sc('N') }),
      item(m.newWindow, undefined, { shortcut: sc('N', { alt: true, cmd: true }) }),
      item(m.open, undefined, { shortcut: sc('O') }),
      closeItem(ctx, m),
      sep,
      item(m.save, undefined, { shortcut: sc('S') }),
      sep,
      item(m.print, undefined, { shortcut: sc('P') }),
    ] },
    editMenu(ctx, m),
    { id: 'view', title: m.view, entries: [
      item(mail.sidebar ? m.hideSidebar : m.showSidebar, 'mail:sidebar', { shortcut: sc('S', { ctrl: true, cmd: true }) }),
      sep,
      fullScreenItem(ctx, m),
    ] },
    { id: 'mailbox', title: m.mailbox, entries: [
      item(m.getNewMail, 'mail:folder:inbox', { shortcut: sc('N', { shift: true, cmd: true }) }),
      sep,
      item(t.mail.inbox, 'mail:folder:inbox', { shortcut: sc('1'), checked: mail.folder === 'inbox' }),
      item(t.mail.drafts, 'mail:folder:drafts', { shortcut: sc('2'), checked: mail.folder === 'drafts' }),
      item(t.mail.junk, 'mail:folder:spam', { shortcut: sc('3'), checked: mail.folder === 'spam' }),
    ] },
    { id: 'message', title: m.message, entries: [
      item(m.reply, mail.canReply ? 'mail:reply' : undefined, { shortcut: sc('R') }),
      item(m.replyAll, undefined, { shortcut: sc('R', { shift: true, cmd: true }) }),
      item(m.forwardMsg, undefined, { shortcut: sc('F', { shift: true, cmd: true }) }),
    ] },
    windowMenu(ctx, m),
    helpMenu(ctx, m),
  ]
}

function calendarMenus(ctx: MenuContext, t: DesktopStrings): MenuDef[] {
  const m = t.mb
  return [
    { id: 'file', title: m.file, entries: [
      item(m.newEvent, undefined, { shortcut: sc('N') }),
      sep,
      closeItem(ctx, m),
      sep,
      item(m.print, undefined, { shortcut: sc('P') }),
    ] },
    editMenu(ctx, m),
    { id: 'view', title: m.view, entries: [
      item(t.calendar.day, 'cal:today', { shortcut: sc('1'), checked: true }),
      item(t.calendar.week, undefined, { shortcut: sc('2') }),
      item(t.calendar.month, undefined, { shortcut: sc('3') }),
      item(t.calendar.year, undefined, { shortcut: sc('4') }),
      sep,
      item(m.goToday, 'cal:today', { shortcut: sc('T') }),
      sep,
      fullScreenItem(ctx, m),
    ] },
    windowMenu(ctx, m),
    helpMenu(ctx, m),
  ]
}

/** Slack, Discord, Drive, Finder and the assistant windows share a generic set. */
function genericMenus(ctx: MenuContext, t: DesktopStrings): MenuDef[] {
  const m = t.mb
  const finderLike = ctx.app === 'finder' || ctx.app === 'assistant' || ctx.app === 'drive'
  const file: MenuEntry[] = finderLike
    ? [item(m.newWindow, 'go:drive', { shortcut: sc('N') }), item(m.newFolder, undefined, { shortcut: sc('N', { shift: true, cmd: true }) }), item(m.open, undefined, { shortcut: sc('O') }), closeItem(ctx, m)]
    : [item(m.newWindow, undefined, { shortcut: sc('N') }), closeItem(ctx, m)]
  const view: MenuEntry[] = finderLike
    ? [item(m.asIcons, undefined, { shortcut: sc('1') }), item(m.asList, ctx.app === 'drive' ? 'noop' : undefined, { shortcut: sc('2'), checked: ctx.app === 'drive' }), sep, fullScreenItem(ctx, m)]
    : [fullScreenItem(ctx, m)]
  return [
    { id: 'file', title: m.file, entries: file },
    editMenu(ctx, m),
    { id: 'view', title: m.view, entries: view },
    { id: 'go', title: m.go, entries: [
      item(m.back, undefined, { shortcut: sc('[') }),
      item(m.forward, undefined, { shortcut: sc(']') }),
      ...(finderLike ? [
        sep,
        item(m.documents, 'go:drive', { shortcut: sc('O', { shift: true, cmd: true }) }),
        item(m.desktop, 'go:desktop', { shortcut: sc('D', { shift: true, cmd: true }) }),
        item(m.downloads, undefined, { shortcut: sc('L', { alt: true, cmd: true }) }),
      ] : []),
    ] },
    windowMenu(ctx, m),
    helpMenu(ctx, m),
  ]
}

/** Full menu bar for the focused app: system menu, bold app menu, then the app's menus. */
export function buildMenus(ctx: MenuContext, t: DesktopStrings): MenuDef[] {
  const rest = ctx.app === 'mail' ? mailMenus(ctx, t) : ctx.app === 'calendar' ? calendarMenus(ctx, t) : genericMenus(ctx, t)
  return [systemMenu(t.mb, ctx.user), appMenu(ctx, t.mb), ...rest]
}

export interface KeyLike { key: string, metaKey: boolean, ctrlKey: boolean, shiftKey: boolean, altKey: boolean }

/**
 * Menu shortcut handled by the desktop itself, or null. Cmd or Ctrl both count as the
 * command key (browsers reserve some Cmd combos). Nothing fires while typing in a field;
 * the standard edit shortcuts stay native there.
 */
export function shortcutAction(e: KeyLike, ctx: { app: MenuApp, editable: boolean, hasFocusedWindow: boolean }): string | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || ctx.editable) return null
  const k = e.key.toLowerCase()
  if (k === 'n') return ctx.app === 'mail' ? 'mail:new' : null
  if (k === 'w') return ctx.hasFocusedWindow ? 'win:close' : null
  if (k === 'm') return ctx.hasFocusedWindow ? 'win:minimize' : null
  if (ctx.app === 'mail' && (k === '1' || k === '2' || k === '3')) return `mail:folder:${(['inbox', 'drafts', 'spam'] as const)[Number(k) - 1]}`
  return null
}
