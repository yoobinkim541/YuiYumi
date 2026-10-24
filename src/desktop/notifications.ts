// macOS-style notification banners inside the virtual desktop. Banners are part of the
// captured screen (they are what the user sees), so the observer can react to them.

import { reactive } from 'vue'
import type { AppId } from './windows'

export interface Notice {
  id: number
  app: string
  title: string
  body: string
  /** Window to focus when the banner is clicked. */
  target?: AppId
  at: number
}

export const NOTICE_TTL_MS = 9000
const MAX_VISIBLE = 3

export const notifications = reactive<{ items: Notice[] }>({ items: [] })

let seq = 0

export function notify(n: { app: string, title: string, body: string, target?: AppId, ttlMs?: number }): Notice {
  const notice: Notice = { id: ++seq, app: n.app, title: n.title, body: n.body, target: n.target, at: Date.now() }
  notifications.items.unshift(notice)
  if (notifications.items.length > MAX_VISIBLE) notifications.items.length = MAX_VISIBLE
  setTimeout(() => dismiss(notice.id), n.ttlMs ?? NOTICE_TTL_MS)
  return notice
}

export function dismiss(id: number): void {
  const i = notifications.items.findIndex(n => n.id === id)
  if (i >= 0) notifications.items.splice(i, 1)
}
