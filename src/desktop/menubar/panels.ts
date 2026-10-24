// Pure helpers for the menu bar extras.

import type { CalendarEvent } from '@/stores/demo'

/** Day numbers of the month containing `d`, padded with 0 for the blank cells before day 1 (weeks start on Sunday). */
export function monthGrid(d: Date): number[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return [...Array.from({ length: first.getDay() }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)]
}

/** Events that start on the same local day as `now`, in start order. */
export function todaysEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const day = now.toDateString()
  return events.filter(e => new Date(e.start).toDateString() === day).sort((a, b) => a.start.localeCompare(b.start))
}

/** Percentage fill of a range input, for painting the track. */
export function rangeFill(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.round(Math.min(Math.max((value - min) / (max - min), 0), 1) * 100)
}
