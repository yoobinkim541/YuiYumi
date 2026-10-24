import { afterEach, describe, expect, it, vi } from 'vitest'
import { findConflicts, gcalCreate, gcalList, parseBoundIn, toEvent, zonedDate, zonedTime } from './gcal'
import { GoogleSession } from './google'
import { RejectedError } from './http'

const session = () => new GoogleSession({ p: 'google', rt: 'rt', at: 'at', exp: Date.now() + 3_600_000, email: `cal-${Math.random()}@example.com`, gm: true, cal: true })

afterEach(() => vi.unstubAllGlobals())

describe('calendar time zones', () => {
  it('resolves date-only bounds to midnight in the calendar zone (DST aware)', () => {
    expect(new Date(zonedTime(2026, 10, 24, 0, 0, 'Asia/Seoul')).toISOString()).toBe('2026-10-23T15:00:00.000Z')
    expect(new Date(parseBoundIn('2026-10-24', true, 'Asia/Seoul')).toISOString()).toBe('2026-10-24T15:00:00.000Z')
    // New York: EDT (-4) before Nov 1, EST (-5) after.
    expect(new Date(zonedTime(2026, 10, 31, 9, 0, 'America/New_York')).toISOString()).toBe('2026-10-31T13:00:00.000Z')
    expect(new Date(zonedTime(2026, 11, 2, 9, 0, 'America/New_York')).toISOString()).toBe('2026-11-02T14:00:00.000Z')
    expect(zonedDate(Date.parse('2026-10-24T16:00:00Z'), 'Asia/Seoul')).toBe('2026-10-25')
    expect(() => parseBoundIn('yesterday', false, 'UTC')).toThrow(RejectedError)
  })

  it('maps timed and all-day events and drops cancelled ones', () => {
    expect(toEvent({ id: 'a', summary: 'Standup', start: { dateTime: '2026-10-24T10:00:00+09:00' }, end: { dateTime: '2026-10-24T10:30:00+09:00' }, location: 'Room' }, 'Asia/Seoul'))
      .toEqual({ id: 'a', title: 'Standup', start: '2026-10-24T01:00:00.000Z', end: '2026-10-24T01:30:00.000Z', location: 'Room' })
    expect(toEvent({ id: 'b', start: { date: '2026-10-24' }, end: { date: '2026-10-25' } }, 'Asia/Seoul'))
      .toMatchObject({ title: '(no title)', start: '2026-10-23T15:00:00.000Z', end: '2026-10-24T15:00:00.000Z' })
    expect(toEvent({ id: 'c', status: 'cancelled', start: { date: '2026-10-24' }, end: { date: '2026-10-25' } }, 'UTC')).toBeNull()
  })

  it('computes conflicts like the mock', () => {
    const c = findConflicts([
      { id: 'e3', title: 'Lunch', start: '2026-10-24T03:00:00Z', end: '2026-10-24T04:00:00Z' },
      { id: 'e1', title: 'Standup', start: '2026-10-24T01:00:00Z', end: '2026-10-24T01:30:00Z' },
      { id: 'e2', title: 'Call', start: '2026-10-24T01:15:00Z', end: '2026-10-24T02:00:00Z' },
    ])
    expect(c).toHaveLength(1)
    expect([c[0]!.a.id, c[0]!.b.id, c[0]!.overlapStart, c[0]!.overlapEnd]).toEqual(['e1', 'e2', '2026-10-24T01:15:00.000Z', '2026-10-24T01:30:00.000Z'])
  })
})

describe('calendar ops (fetch stub)', () => {
  it('lists a date range in the calendar zone and reports the range for the store', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return Response.json({ timeZone: 'Asia/Seoul', items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-10-24T10:00:00+09:00' }, end: { dateTime: '2026-10-24T10:30:00+09:00' } }] })
    }))
    const r = await gcalList(session(), { from: '2026-10-24', to: '2026-10-24' })
    expect(r.result).toEqual({ events: [{ id: 'e1', title: 'Standup', start: '2026-10-24T01:00:00.000Z', end: '2026-10-24T01:30:00.000Z' }] })
    expect(r.patch?.eventRange).toEqual({ from: '2026-10-23T15:00:00.000Z', to: '2026-10-24T15:00:00.000Z' })
    const q = new URL(urls.at(-1)!).searchParams
    expect(q.get('timeMin')).toBe('2026-10-23T15:00:00.000Z')
    expect(q.get('singleEvents')).toBe('true')
  })

  it('creates events with the zone and rejects end before start without calling Google', async () => {
    const calls: { url: string, body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (init?.method === 'POST') return Response.json({ id: 'new1', summary: 'Review', start: { dateTime: '2026-10-24T15:00:00+09:00' }, end: { dateTime: '2026-10-24T16:00:00+09:00' } })
      return Response.json({ timeZone: 'Asia/Seoul', items: [] })
    }))
    const s = session()
    await expect(gcalCreate(s, { title: 'X', start: '2026-10-24T15:00:00+09:00', end: '2026-10-24T14:00:00+09:00' })).rejects.toThrow('end must be after start')
    const r = await gcalCreate(s, { title: 'Review', start: '2026-10-24T15:00:00', end: '2026-10-24T16:00:00' })
    expect(r.result).toEqual({ eventId: 'new1', created: true, title: 'Review', start: '2026-10-24T06:00:00.000Z', end: '2026-10-24T07:00:00.000Z' })
    const post = calls.find(c => c.body)!
    expect(post.body).toMatchObject({ summary: 'Review', start: { dateTime: '2026-10-24T06:00:00.000Z', timeZone: 'Asia/Seoul' } })
  })
})
