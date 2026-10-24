// User activity inside the virtual desktop: focused app, its window title, typing.

import type { ActivitySnapshot } from '@/core/types'
import { topUserWindow } from './windows'

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
  // Assistant windows (settings, dashboard) are never reported to the observer.
  const w = topUserWindow()
  return {
    activeApp: w ? w.appName : null,
    windowTitle: w ? w.title : null,
    typing: isTyping(),
  }
}
