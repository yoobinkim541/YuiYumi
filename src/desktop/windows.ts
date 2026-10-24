// Window manager state for the virtual desktop (logical 1920x1080 coordinates).

import { reactive } from 'vue'

export type AppId = 'mail' | 'calendar' | 'slack' | 'discord' | 'drive'

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

export const APP_ORDER: AppId[] = ['mail', 'calendar', 'slack', 'discord', 'drive']

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
  } as Record<AppId, WindowState>,
  focused: 'mail' as AppId | null,
})

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

export function setWindowTitle(id: AppId, title: string): void {
  desktop.windows[id].title = title
}

export function moveWindow(id: AppId, x: number, y: number): void {
  const w = desktop.windows[id]
  w.x = Math.round(Math.min(Math.max(x, -w.w + 160), DESKTOP_W - 160))
  w.y = Math.round(Math.min(Math.max(y, MENUBAR_H), DESKTOP_H - DOCK_H - 40))
}
