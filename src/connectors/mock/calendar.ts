import type { CalendarEvent } from '@/stores/demo'
import { ConnectorError, type MockOp } from '../types'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse an ISO date or date-time. Date-only values are local midnight; `end` makes them inclusive of that day. */
export function parseBound(value: string, end: boolean): number {
  const m = DATE_ONLY.exec(value.trim())
  if (m) {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (end ? 1 : 0)).getTime()
    return t
  }
  const t = Date.parse(value)
  if (Number.isNaN(t)) throw new ConnectorError(`Invalid date "${value}". Use ISO 8601, e.g. 2026-10-24 or 2026-10-24T09:00:00+09:00.`)
  return t
}

function range(from: string, to: string): [number, number] {
  const a = parseBound(from, false)
  const b = parseBound(to, true)
  if (b <= a) throw new ConnectorError('"to" must be after "from".')
  return [a, b]
}

const view = (e: CalendarEvent) => ({ id: e.id, title: e.title, start: e.start, end: e.end, ...(e.location ? { location: e.location } : {}) })

function eventsIn(events: CalendarEvent[], a: number, b: number): CalendarEvent[] {
  return events
    .filter(e => Date.parse(e.start) < b && Date.parse(e.end) > a)
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start))
}

export const calendarList: MockOp<'calendar_list'> = (demo, input) => {
  const [a, b] = range(input.from, input.to)
  return { events: eventsIn(demo.events, a, b).map(view) }
}

export const calendarConflicts: MockOp<'calendar_conflicts'> = (demo, input) => {
  const [a, b] = range(input.from, input.to)
  const list = eventsIn(demo.events, a, b)
  const conflicts: { a: ReturnType<typeof view>, b: ReturnType<typeof view>, overlapStart: string, overlapEnd: string }[] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const x = list[i]!
      const y = list[j]!
      const s = Math.max(Date.parse(x.start), Date.parse(y.start))
      const e = Math.min(Date.parse(x.end), Date.parse(y.end))
      if (s < e) conflicts.push({ a: view(x), b: view(y), overlapStart: new Date(s).toISOString(), overlapEnd: new Date(e).toISOString() })
    }
  }
  return { conflicts }
}

export const calendarCreateEvent: MockOp<'calendar_create_event'> = (demo, input) => {
  const s = Date.parse(input.start)
  const e = Date.parse(input.end)
  if (Number.isNaN(s) || Number.isNaN(e)) throw new ConnectorError('start and end must be ISO 8601 date-times.')
  if (e <= s) throw new ConnectorError('end must be after start.')
  const ev = demo.addEvent({ title: input.title, start: input.start, end: input.end })
  return { eventId: ev.id, created: true, title: ev.title, start: ev.start, end: ev.end }
}

export const calendarDeleteEvent: MockOp<'calendar_delete_event'> = (demo, input) => {
  const i = demo.events.findIndex(e => e.id === input.id)
  if (i < 0) throw new ConnectorError(`No event with id "${input.id}".`)
  const [ev] = demo.events.splice(i, 1)
  demo.deletedEvents.push(ev!)
  return { eventId: ev!.id, deleted: true, title: ev!.title, start: ev!.start, reversible: true }
}
