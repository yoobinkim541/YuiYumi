import { afterEach, describe, expect, it, vi } from 'vitest'
import koMails from '../data/demo/ko/mails.json'
import { GoogleSession } from './google'
import { addSamples } from './samples'

afterEach(() => vi.unstubAllGlobals())

describe('opt-in sample data', () => {
  it('inserts only missing sample mails (spam into SPAM, replies to the own address) and today\'s events once', async () => {
    const inserted: { labelIds: string[], raw: string }[] = []
    const events: { extendedProperties: { private: Record<string, string> }, start: { dateTime: string, timeZone: string } }[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      const url = new URL(u)
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url.pathname.endsWith('/labels') && !body) return Response.json({ labels: [{ id: 'L1', name: 'YuiYumi samples' }] })
      if (url.pathname.endsWith('/messages') && url.searchParams.get('labelIds') === 'L1') return Response.json({ messages: [{ id: 'old' }, { id: 'trashed' }] })
      if (url.pathname.endsWith('/messages/old')) return Response.json({ id: 'old', labelIds: ['INBOX', 'L1'], payload: { headers: [{ name: 'X-YuiYumi-Sample', value: 'mail-jp-001' }] } })
      if (url.pathname.endsWith('/messages/trashed')) return Response.json({ id: 'trashed', labelIds: ['TRASH', 'L1'], payload: { headers: [{ name: 'X-YuiYumi-Sample', value: 'mail-tw-001' }] } })
      if (url.pathname.endsWith('/messages') && init?.method === 'POST') { inserted.push(body); return Response.json({ id: `n${inserted.length}` }) }
      if (url.pathname.endsWith('/events') && init?.method === 'POST') { events.push(body); return Response.json({ id: `e${events.length}` }) }
      if (url.pathname.endsWith('/events')) return Response.json({ timeZone: 'Asia/Seoul', items: [] })
      return new Response('{}', { status: 404 })
    }))
    const s = new GoogleSession({ p: 'google', rt: 'rt', at: 'at', exp: Date.now() + 3_600_000, email: 'judge@example.com', gm: true, cal: true })
    const r = await addSamples(s, 'ko', new Date('2026-10-24T03:00:00Z'))
    expect(r.mailsAdded).toBe(koMails.mails.length - 1) // mail-jp-001 exists; the trashed one is re-added
    const spam = inserted.find(m => m.labelIds.includes('SPAM'))!
    expect(spam.labelIds).toContain('L1')
    const mime = Buffer.from(inserted[0]!.raw, 'base64url').toString('utf8')
    expect(mime).toContain('X-YuiYumi-Sample: mail-tw-001')
    expect(mime).toMatch(/Reply-To: .*<judge\+mail-tw-001@example\.com>/)
    expect(r.eventsAdded).toBe(events.length)
    expect(events[0]).toMatchObject({ start: { dateTime: '2026-10-24T09:30:00', timeZone: 'Asia/Seoul' }, extendedProperties: { private: { yuiyumi: 'sample', yuiyumiSample: 'ev-001', yuiyumiDay: '2026-10-24' } } })
  })
})
