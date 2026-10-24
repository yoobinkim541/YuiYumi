// User activity inside the virtual desktop: focused app, its window title, typing.

import type { ActivitySnapshot } from '@/core/types'
import { desktop } from './windows'

export const TYPING_WINDOW_MS = 1500

let lastKeyAt = 0

/** Called by the desktop root on keydown inside the captured area. */
export function markKeystroke(at: number = Date.now()): void {
  lastKeyAt = at
}

export function isTyping(now: number = Date.now()): boolean {
  return now - lastKeyAt < TYPING_WINDOW_MS
}

export function getActivity(): ActivitySnapshot {
  const id = desktop.focused
  const w = id ? desktop.windows[id] : null
  return {
    activeApp: w && w.open ? w.appName : null,
    windowTitle: w && w.open ? w.title : null,
    typing: isTyping(),
  }
}
