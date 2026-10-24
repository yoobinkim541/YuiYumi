// Google Calendar ops on the signed-in user's primary calendar, in that calendar's time zone.
// Results use the mock op shapes (src/connectors/mock/calendar.ts).

import type { LiveConnectorResponse, LiveEvent, LiveStorePatch } from '../shared/contracts'
import { orNotFound, type GoogleSession } from './google'
import { RejectedError } from './http'

export const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary'

interface GEventTime { dateTime?: string, date?: string, timeZone?: string }
export interface GEvent { id: string, status?: string, summary?: string, location?: string, start?: GEventTime, end?: GEventTime }
interface GEventList { items?: GEvent[], timeZone?: string }

// ---------------------------------------------------------------------------
// Time zone arithmetic (no dependencies; Intl knows the zone rules)

/** Offset of `tz` from UTC at `ms`, in minutes. */
export function tzOffsetMinutes(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms))
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

/** Epoch ms of local wall time y-m-d h:mi in `tz` (DST-safe for real wall times). */
export function zonedTime(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess - tzOffsetMinutes(guess, tz) * 60_000
  t = guess - tzOffsetMinutes(t, tz) * 60_000
  return t
}

/** Calendar date (YYYY-MM-DD) of `ms` in `tz`, shifted by `days`. */
export function zonedDate(ms: number, tz: string, days = 0): string {
  const local = new Date(ms + tzOffsetMinutes(ms, tz) * 60_000)
  local.setUTCDate(local.getUTCDate() + days)
  return local.toISOString().slice(0, 10)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const HAS_OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/

/** Like the mock parseBound, but date-only values are midnight in the calendar's zone. */
export function parseBoundIn(value: string, end: boolean, tz: string): number {
  const m = DATE_ONLY.exec(value.trim())
  if (m) return zonedTime(Number(m[1]), Number(m[2]), Number(m[3]) + (end ? 1 : 0), 0, 0, tz)
  const t = parseDateTimeIn(value, tz)
  if (Number.isNaN(t)) throw new RejectedError(`Invalid date "${value}". Use ISO 8601, e.g. 2026-10-24 or 2026-10-24T09:00:00+09:00.`)
  return t
}

/** ISO date-time; without an offset it is wall time in `tz`. NaN when invalid. */
export function parseDateTimeIn(value: string, tz: string): number {
  const v = value.trim()
  if (HAS_OFFSET.test(v)) return Date.parse(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v)
  if (!m) return Number.NaN
  return zonedTime(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz) + Number(m[6] ?? 0) * 1000
}

function range(from: string, to: string, tz: string): [number, number] {
  const a = parseBoundIn(from, false, tz)
  const b = parseBoundIn(to, true, tz)
  if (b <= a) throw new RejectedError('"to" must be after "from".')
  return [a, b]
}

// ---------------------------------------------------------------------------
// Mapping and conflicts

function timeOf(t: GEventTime | undefined, tz: string): string | null {
  if (t?.dateTime) return new Date(t.dateTime).toISOString()
  const m = t?.date ? DATE_ONLY.exec(t.date) : null
  return m ? new Date(zonedTime(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, t?.timeZone ?? tz)).toISOString() : null
}

export function toEvent(e: GEvent, tz: string): LiveEvent | null {
  if (e.status === 'cancelled') return null
  const start = timeOf(e.start, tz)
  const end = timeOf(e.end, tz)
  if (!start || !end) return null
  return { id: e.id, title: e.summary ?? '(no title)', start, end, ...(e.location ? { location: e.location } : {}) }
}

const view = (e: LiveEvent) => ({ id: e.id, title: e.title, start: e.start, end: e.end, ...(e.location ? { location: e.location } : {}) })

/** Every overlapping pair, in start order (same output as the mock). */
export function findConflicts(events: LiveEvent[]) {
  const list = [...events].sort((x, y) => Date.parse(x.start) - Date.parse(y.start))
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
  return conflicts
}

// ---------------------------------------------------------------------------
// Fetching

const tzCache = new Map<string, string>()

/** The primary calendar's time zone (events.list reports it). */
export async function calendarTz(s: GoogleSession): Promise<string> {
  const hit = tzCache.get(s.cred.email)
  if (hit) return hit
  const r = await s.api<GEventList>(`${CALENDAR}/events?maxResults=1`)
  const tz = r.timeZone || 'UTC'
  tzCache.set(s.cred.email, tz)
  return tz
}

async function eventsBetween(s: GoogleSession, a: number, b: number, tz: string): Promise<LiveEvent[]> {
  const q = new URLSearchParams({ timeMin: new Date(a).toISOString(), timeMax: new Date(b).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
  const r = await s.api<GEventList>(`${CALENDAR}/events?${q}`)
  if (r.timeZone) tzCache.set(s.cred.email, r.timeZone)
  return (r.items ?? []).map(e => toEvent(e, tz)).filter((e): e is LiveEvent => e !== null)
}

// ---------------------------------------------------------------------------
// Ops

export async function gcalList(s: GoogleSession, input: { from: string, to: string }): Promise<LiveConnectorResponse> {
  const tz = await calendarTz(s)
  const [a, b] = range(input.from, input.to, tz)
  const events = await eventsBetween(s, a, b, tz)
  return { result: { events: events.map(view) }, patch: { events, eventRange: { from: new Date(a).toISOString(), to: new Date(b).toISOString() } } }
}

export async function gcalConflicts(s: GoogleSession, input: { from: string, to: string }): Promise<LiveConnectorResponse> {
  const listed = await gcalList(s, input)
  return { result: { conflicts: findConflicts(listed.patch!.events!) }, patch: listed.patch }
}

export async function gcalCreate(s: GoogleSession, input: { title: string, start: string, end: string }): Promise<LiveConnectorResponse> {
  const tz = await calendarTz(s)
  const a = parseDateTimeIn(input.start, tz)
  const b = parseDateTimeIn(input.end, tz)
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RejectedError('start and end must be ISO 8601 date-times.')
  if (b <= a) throw new RejectedError('end must be after start.')
  const when = (ms: number) => ({ dateTime: new Date(ms).toISOString(), timeZone: tz })
  const created = await s.api<GEvent>(`${CALENDAR}/events?sendUpdates=none`, { method: 'POST', body: { summary: input.title, start: when(a), end: when(b) } })
  const ev = toEvent(created, tz) ?? { id: created.id, title: input.title, start: new Date(a).toISOString(), end: new Date(b).toISOString() }
  return { result: { eventId: ev.id, created: true, title: ev.title, start: ev.start, end: ev.end }, patch: { events: [ev] } }
}

export async function gcalDelete(s: GoogleSession, input: { id: string }): Promise<LiveConnectorResponse> {
  const tz = await calendarTz(s)
  const url = `${CALENDAR}/events/${encodeURIComponent(input.id)}`
  const ev = toEvent(await orNotFound(s.api<GEvent>(url), `No event with id "${input.id}".`), tz)
  if (!ev) throw new RejectedError(`No event with id "${input.id}".`, 404)
  await orNotFound(s.api(`${url}?sendUpdates=none`, { method: 'DELETE' }), `No event with id "${input.id}".`)
  // Google Calendar keeps deleted events in its Trash for 30 days.
  return { result: { eventId: ev.id, deleted: true, title: ev.title, start: ev.start, reversible: true }, patch: { removeEventIds: [ev.id] } }
}

/** Initial load for the virtual Calendar app. */
export async function gcalSnapshot(s: GoogleSession, input: { from?: string, to?: string }): Promise<LiveStorePatch> {
  const tz = await calendarTz(s)
  const now = Date.now()
  const a = input.from ? parseBoundIn(input.from, false, tz) : parseBoundIn(zonedDate(now, tz, -1), false, tz)
  const b = input.to ? parseBoundIn(input.to, true, tz) : parseBoundIn(zonedDate(now, tz, 7), true, tz)
  return { replace: ['calendar'], events: await eventsBetween(s, a, b, tz) }
}
