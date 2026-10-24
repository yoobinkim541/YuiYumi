// Opt-in sample data: on the user's explicit request, inserts the fictional demo mails
// (data/demo/<lang>/mails.json) into their Gmail inbox and today's demo events (with the
// overlap) into their primary calendar, so the demo story works on a real account.
// Idempotent through a Gmail label plus a marker header and private event properties;
// "remove" trashes the sample mails and deletes the sample events.

import type { Lang } from '../shared/languages'
import enCal from '../data/demo/en/calendar.json'
import enMails from '../data/demo/en/mails.json'
import jaCal from '../data/demo/ja/calendar.json'
import jaMails from '../data/demo/ja/mails.json'
import koCal from '../data/demo/ko/calendar.json'
import koMails from '../data/demo/ko/mails.json'
import hansCal from '../data/demo/zh-Hans/calendar.json'
import hansMails from '../data/demo/zh-Hans/mails.json'
import hantCal from '../data/demo/zh-Hant/calendar.json'
import hantMails from '../data/demo/zh-Hant/mails.json'
import { CALENDAR, calendarTz, zonedDate } from './gcal'
import { GMAIL } from './gmail'
import { mapLimit, type GoogleSession } from './google'
import { buildMime, parseAddressList, toRaw, type GmailMessage } from './mime'

interface SampleMail { id: string, from: string, subject: string, body: string, minutesAgo: number, read: boolean, spam?: boolean }
interface SampleEvent { id: string, title: string, dayOffset: number, start: string, end: string, location?: string }

const DATA: Record<Lang, { mails: SampleMail[], events: SampleEvent[] }> = {
  'en': { mails: enMails.mails, events: enCal.events },
  'ja': { mails: jaMails.mails, events: jaCal.events },
  'ko': { mails: koMails.mails, events: koCal.events },
  'zh-Hans': { mails: hansMails.mails, events: hansCal.events },
  'zh-Hant': { mails: hantMails.mails, events: hantCal.events },
}

export const SAMPLE_LABEL = 'YuiYumi samples'
const MARK_HEADER = 'X-YuiYumi-Sample'
const PROP = 'yuiyumi'

async function sampleLabelId(s: GoogleSession): Promise<string> {
  const r = await s.api<{ labels?: { id: string, name: string }[] }>(`${GMAIL}/labels`)
  const hit = r.labels?.find(l => l.name === SAMPLE_LABEL)
  if (hit) return hit.id
  const created = await s.api<{ id: string }>(`${GMAIL}/labels`, { method: 'POST', body: { name: SAMPLE_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })
  return created.id
}

/** Sample mails still in the mailbox (not in Trash): Gmail id and sample id. */
async function existingMails(s: GoogleSession, labelId: string): Promise<{ id: string, sample: string }[]> {
  const r = await s.api<{ messages?: { id: string }[] }>(`${GMAIL}/messages?${new URLSearchParams({ labelIds: labelId, includeSpamTrash: 'true', maxResults: '100' })}`)
  const metas = await mapLimit(r.messages ?? [], 5, m =>
    s.api<GmailMessage>(`${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=${MARK_HEADER}`))
  return metas
    .filter(m => !(m.labelIds ?? []).includes('TRASH'))
    .map(m => ({ id: m.id, sample: m.payload?.headers?.find(h => h.name.toLowerCase() === MARK_HEADER.toLowerCase())?.value ?? '' }))
}

async function existingEvents(s: GoogleSession): Promise<{ id: string, key: string }[]> {
  const q = new URLSearchParams({ privateExtendedProperty: `${PROP}=sample`, maxResults: '250', singleEvents: 'true' })
  const r = await s.api<{ items?: { id: string, status?: string, extendedProperties?: { private?: Record<string, string> } }[] }>(`${CALENDAR}/events?${q}`)
  return (r.items ?? []).filter(e => e.status !== 'cancelled').map(e => ({
    id: e.id, key: `${e.extendedProperties?.private?.yuiyumiSample}@${e.extendedProperties?.private?.yuiyumiDay}`,
  }))
}

/** Plus address of the user's own mailbox, so replies to samples come back instead of bouncing. */
function selfAlias(email: string, tag: string): string {
  const [local, domain] = email.split('@')
  return domain ? `${local}+${tag.replace(/[^a-z0-9-]/gi, '')}@${domain}` : email
}

export async function addSamples(s: GoogleSession, lang: Lang, now = new Date()) {
  const data = DATA[lang] ?? DATA.en
  let mailsAdded = 0
  let eventsAdded = 0
  if (s.cred.gm) {
    const labelId = await sampleLabelId(s)
    const have = new Set((await existingMails(s, labelId)).map(m => m.sample))
    for (const m of data.mails) {
      if (have.has(m.id)) continue
      const sender = parseAddressList(m.from)[0] ?? { name: '', email: m.from }
      const mime = buildMime({
        from: m.from,
        to: s.cred.email,
        replyTo: `${sender.name ? `${sender.name} ` : ''}<${selfAlias(s.cred.email, m.id)}>`,
        subject: m.subject,
        body: m.body,
        date: new Date(now.getTime() - m.minutesAgo * 60_000),
        messageId: `<yuiyumi-sample-${m.id}-${now.getTime()}@yuiyumi.app>`,
        extra: { [MARK_HEADER]: m.id, 'X-YuiYumi-Lang': lang },
      })
      const labelIds = [m.spam ? 'SPAM' : 'INBOX', labelId, ...(m.read ? [] : ['UNREAD'])]
      await s.api(`${GMAIL}/messages?internalDateSource=dateHeader`, { method: 'POST', body: { raw: toRaw(mime), labelIds } })
      mailsAdded++
    }
  }
  if (s.cred.cal) {
    const tz = await calendarTz(s)
    const have = new Set((await existingEvents(s)).map(e => e.key))
    for (const e of data.events) {
      const day = zonedDate(now.getTime(), tz, e.dayOffset)
      if (have.has(`${e.id}@${day}`)) continue
      await s.api(`${CALENDAR}/events?sendUpdates=none`, {
        method: 'POST',
        body: {
          summary: e.title,
          ...(e.location ? { location: e.location } : {}),
          start: { dateTime: `${day}T${e.start}:00`, timeZone: tz },
          end: { dateTime: `${day}T${e.end}:00`, timeZone: tz },
          extendedProperties: { private: { [PROP]: 'sample', yuiyumiSample: e.id, yuiyumiDay: day } },
        },
      })
      eventsAdded++
    }
  }
  return { mailsAdded, eventsAdded }
}

export async function removeSamples(s: GoogleSession) {
  let mailsRemoved = 0
  let eventsRemoved = 0
  if (s.cred.gm) {
    const labelId = await sampleLabelId(s)
    for (const m of await existingMails(s, labelId)) {
      await s.api(`${GMAIL}/messages/${m.id}/trash`, { method: 'POST' })
      mailsRemoved++
    }
  }
  if (s.cred.cal) {
    for (const e of await existingEvents(s)) {
      await s.api(`${CALENDAR}/events/${encodeURIComponent(e.id)}?sendUpdates=none`, { method: 'DELETE' })
      eventsRemoved++
    }
  }
  return { mailsRemoved, eventsRemoved }
}

