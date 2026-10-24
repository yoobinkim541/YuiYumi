// Window manager state for the virtual desktop (logical 1920x1080 coordinates).

import { reactive } from 'vue'

export type UserAppId = 'mail' | 'calendar' | 'slack' | 'discord' | 'drive'
/** Assistant-owned windows. Excluded from captures and from the reported activity. */
export type AssistantAppId = 'settings' | 'dashboard'
export type AppId = UserAppId | AssistantAppId

export interface WindowState {
  id: AppId
  appName: string
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  open: boolean
}

export const DESKTOP_W = 1920
export const DESKTOP_H = 1080
export const MENUBAR_H = 40
export const DOCK_H = 96

export const APP_ORDER: UserAppId[] = ['mail', 'calendar', 'slack', 'discord', 'drive']

let zTop = 10

function win(id: AppId, appName: string, x: number, y: number, w: number, h: number, open: boolean): WindowState {
  return { id, appName, title: appName, x, y, w, h, z: ++zTop, open }
}

export const desktop = reactive({
  windows: {
    calendar: win('calendar', 'Calendar', 1200, 64, 690, 870, true),
    drive: win('drive', 'Drive', 260, 110, 1240, 780, false),
    discord: win('discord', 'Discord', 220, 90, 1260, 800, false),
    slack: win('slack', 'Slack', 180, 70, 1280, 820, false),
    mail: win('mail', 'Mail', 36, 60, 1140, 870, true),
    settings: win('settings', 'YuiYumi Settings', 360, 110, 1000, 700, false),
    dashboard: win('dashboard', 'YuiYumi Dashboard', 400, 130, 1000, 700, false),
  } as Record<AppId, WindowState>,
  focused: 'mail' as AppId | null,
})

export const ASSISTANT_APPS: AssistantAppId[] = ['settings', 'dashboard']

export function isAssistantApp(id: AppId): id is AssistantAppId {
  return (ASSISTANT_APPS as AppId[]).includes(id)
}

/** Topmost open user (non-assistant) window, used for activity reporting. */
export function topUserWindow(): WindowState | null {
  const f = desktop.focused
  if (f && !isAssistantApp(f) && desktop.windows[f].open) return desktop.windows[f]
  return Object.values(desktop.windows)
    .filter(w => w.open && !isAssistantApp(w.id))
    .sort((a, b) => b.z - a.z)[0] ?? null
}

/** Character window (always on top, frameless) placed in desktop coordinates. */
export const CHARACTER_W = 400
/** Height reserved under the avatar for the control pill. */
export const PILL_ZONE = 72
/** Avatar area plus the pill zone. */
export const CHARACTER_H = 540 + PILL_ZONE
export const assistantWindow = reactive({
  visible: true,
  pinned: true,
  x: DESKTOP_W - CHARACTER_W - 36,
  y: DESKTOP_H - CHARACTER_H - 120,
})

export function moveAssistantWindow(x: number, y: number): void {
  assistantWindow.x = Math.round(Math.min(Math.max(x, 0), DESKTOP_W - CHARACTER_W))
  assistantWindow.y = Math.round(Math.min(Math.max(y, MENUBAR_H + 120), DESKTOP_H - 160))
}

/** Current CSS scale of the desktop on the page (used to convert pointer deltas). */
export const desktopView = reactive({ scale: 1 })

export function focusWindow(id: AppId): void {
  const w = desktop.windows[id]
  w.open = true
  if (desktop.focused !== id || w.z !== zTop) w.z = ++zTop
  desktop.focused = id
}

export function closeWindow(id: AppId): void {
  desktop.windows[id].open = false
  if (desktop.focused === id) {
    const next = Object.values(desktop.windows).filter(w => w.open).sort((a, b) => b.z - a.z)[0]
    desktop.focused = next?.id ?? null
  }
}

/** No minimized state exists, so minimizing hides the window like the yellow button does. */
export function minimizeWindow(id: AppId): void {
  closeWindow(id)
}

/** Saved geometry per window while it is zoomed (green button behavior). */
const zoomed: Partial<Record<AppId, { x: number, y: number, w: number, h: number }>> = {}

/** Toggle between filling the area between the menu bar and the Dock and the previous frame. */
export function zoomWindow(id: AppId): void {
  const w = desktop.windows[id]
  const prev = zoomed[id]
  if (prev) {
    Object.assign(w, prev)
    delete zoomed[id]
  } else {
    zoomed[id] = { x: w.x, y: w.y, w: w.w, h: w.h }
    Object.assign(w, { x: 8, y: MENUBAR_H + 8, w: DESKTOP_W - 16, h: DESKTOP_H - MENUBAR_H - DOCK_H - 40 })
  }
  focusWindow(id)
}

/** Raise every open user window, keeping their stacking order, and keep the focused one on top. */
export function bringAllToFront(): void {
  const open = Object.values(desktop.windows).filter(w => w.open && !isAssistantApp(w.id)).sort((a, b) => a.z - b.z)
  for (const w of open) w.z = ++zTop
  const f = desktop.focused
  if (f && desktop.windows[f].open) desktop.windows[f].z = ++zTop
}

export function setWindowTitle(id: AppId, title: string): void {
  desktop.windows[id].title = title
}

export function moveWindow(id: AppId, x: number, y: number): void {
  const w = desktop.windows[id]
  w.x = Math.round(Math.min(Math.max(x, -w.w + 160), DESKTOP_W - 160))
  w.y = Math.round(Math.min(Math.max(y, MENUBAR_H), DESKTOP_H - DOCK_H - 40))
}
