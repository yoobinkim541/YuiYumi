// Builds the demo dataset from data/demo/*.json with timestamps relative to `now`.

import calendarJson from '../../data/demo/calendar.json'
import discordJson from '../../data/demo/discord.json'
import driveJson from '../../data/demo/drive.json'
import mailsJson from '../../data/demo/mails.json'
import slackJson from '../../data/demo/slack.json'
import type { CalendarEvent, ChatChannel, ChatMessage, DriveFile, Mail } from '@/stores/demo'

const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

function atLocal(now: Date, dayOffset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, h ?? 0, m ?? 0, 0, 0)
  return d.toISOString()
}

export interface DemoData {
  mails: Mail[]
  events: CalendarEvent[]
  slackChannels: ChatChannel[]
  slackMessages: ChatMessage[]
  discordChannels: ChatChannel[]
  discordMessages: ChatMessage[]
  files: DriveFile[]
}

export function buildDemoData(now: Date = new Date()): DemoData {
  const mails: Mail[] = mailsJson.mails.map(({ minutesAgo, ...m }) => ({ ...m, receivedAt: ago(now, minutesAgo) }))
  const events: CalendarEvent[] = calendarJson.events.map(({ dayOffset, start, end, ...e }) => ({
    ...e,
    start: atLocal(now, dayOffset, start),
    end: atLocal(now, dayOffset, end),
  }))
  const msgs = (list: { minutesAgo: number, id: string, channelId: string, author: string, text: string }[]): ChatMessage[] =>
    list.map(({ minutesAgo, ...m }) => ({ ...m, at: ago(now, minutesAgo) }))
  const files: DriveFile[] = driveJson.files.map(({ minutesAgo, ...f }) => ({ ...f, modifiedAt: ago(now, minutesAgo) }))
  return {
    mails,
    events,
    slackChannels: slackJson.channels,
    slackMessages: msgs(slackJson.messages),
    discordChannels: discordJson.channels,
    discordMessages: msgs(discordJson.messages),
    files,
  }
}
