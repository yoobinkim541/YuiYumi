// Reminder clock: fires pending reminders from the demo store when their time comes. A
// firing shows a macOS-style banner and the character says the reminder out loud.

import type { Lang } from '@shared/languages'
import { bus } from '@/core/bus'
import { useDemo, type Reminder } from '@/stores/demo'
import { useSettings } from '@/stores/settings'
import { notify } from './notifications'

export const REMINDER_TICK_MS = 1000

/** Pending reminders whose time has come. */
export function dueReminders(list: Reminder[], now: number): Reminder[] {
  return list.filter(r => r.status === 'pending' && Date.parse(r.at) <= now)
}

const LINES: Record<Lang, { app: string, line: (title: string) => string }> = {
  'en': { app: 'Reminders', line: t => `Hey, it's time: ${t}!` },
  'ja': { app: 'リマインダー', line: t => `ねえ、時間だよ！${t}！` },
  'ko': { app: '미리 알림', line: t => `시간 됐어! ${t}!` },
  'zh-Hans': { app: '提醒事项', line: t => `时间到啦！${t}！` },
  'zh-Hant': { app: '提醒事項', line: t => `時間到囉！${t}！` },
}

export function fireReminder(r: Reminder, lang: Lang): void {
  r.status = 'fired'
  const l = LINES[lang] ?? LINES.en
  const at = new Date(r.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  notify({ app: l.app, title: r.title, body: at, ttlMs: 12_000 })
  bus.emit('character:react', { emotion: 'surprised', line: l.line(r.title), source: 'agent' })
}

let timer: ReturnType<typeof setInterval> | null = null

export function startReminderClock(): void {
  if (timer) return
  const demo = useDemo()
  const settings = useSettings()
  timer = setInterval(() => {
    for (const r of dueReminders(demo.reminders, Date.now())) fireReminder(r, settings.lang)
  }, REMINDER_TICK_MS)
}
