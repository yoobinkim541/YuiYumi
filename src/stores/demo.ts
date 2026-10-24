// Session data behind the virtual desktop. The desktop apps render it and the mock
// connectors read and write it, so what the observer sees on screen and what the agent
// reads through tools are the same data. When the user connected a service, its
// collections hold the real account's data (mirrored from the live connector responses).

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LiveService, LiveStorePatch } from '@shared/contracts'

export interface Mail {
  id: string
  from: string
  to: string
  subject: string
  body: string
  receivedAt: string
  lang: string
  read: boolean
  spam?: boolean
  /** Moved to Trash (reversible). */
  trashed?: boolean
}

/** A message sent from the virtual PC (by the user or by the assistant on the user's behalf). */
export interface SentMail {
  id: string
  replyToId?: string
  to: string
  subject: string
  body: string
  sentAt: string
  viaAssistant?: boolean
}

export interface Reminder {
  id: string
  title: string
  /** ISO 8601 date-time when it fires. */
  at: string
  createdAt: string
  status: 'pending' | 'fired' | 'cancelled'
}

export interface MailDraft {
  id: string
  replyToId?: string
  to: string
  subject: string
  body: string
  createdAt: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
}

export interface ChatChannel {
  id: string
  name: string
  workspace: string
}

export interface ChatMessage {
  id: string
  channelId: string
  author: string
  text: string
  at: string
  /** Posted by the assistant on the user's behalf (shows a small marker). */
  viaAssistant?: boolean
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedAt: string
  content: string
}

export const useDemo = defineStore('demo', () => {
  const mails = ref<Mail[]>([])
  const drafts = ref<MailDraft[]>([])
  const events = ref<CalendarEvent[]>([])
  const slackChannels = ref<ChatChannel[]>([])
  const slackMessages = ref<ChatMessage[]>([])
  /** Composer drafts per Slack channel. Never posted. */
  const slackDrafts = ref<Record<string, string>>({})
  const discordChannels = ref<ChatChannel[]>([])
  const discordMessages = ref<ChatMessage[]>([])
  const files = ref<DriveFile[]>([])
  const sent = ref<SentMail[]>([])
  /** Calendar events deleted in this session (reversible). */
  const deletedEvents = ref<CalendarEvent[]>([])
  const reminders = ref<Reminder[]>([])
  /** Services whose collections hold the user's real account data (seed() leaves them alone). */
  const live = ref<Partial<Record<LiveService, boolean>>>({})

  function seed(data: Partial<{
    mails: Mail[], events: CalendarEvent[], slackChannels: ChatChannel[], slackMessages: ChatMessage[],
    discordChannels: ChatChannel[], discordMessages: ChatMessage[], files: DriveFile[]
  }>) {
    const l = live.value
    if (data.mails && !l.mail) mails.value = data.mails
    if (data.events && !l.calendar) events.value = data.events
    if (data.slackChannels && !l.slack) slackChannels.value = data.slackChannels
    if (data.slackMessages && !l.slack) slackMessages.value = data.slackMessages
    if (data.discordChannels && !l.discord) discordChannels.value = data.discordChannels
    if (data.discordMessages && !l.discord) discordMessages.value = data.discordMessages
    if (data.files) files.value = data.files
  }

  function setLive(service: LiveService, on: boolean) {
    live.value = { ...live.value, [service]: on }
  }

  /** Inserts or updates items by id, keeping object identity (and Vue reactivity) of existing ones. */
  function upsert<T extends { id: string }>(list: T[], items: T[]) {
    for (const item of items) {
      const cur = list.find(x => x.id === item.id)
      if (cur) Object.assign(cur, item)
      else list.push(item)
    }
  }

  /** Mirrors a live connector result. `created` items get the assistant marker when `viaAssistant`. */
  function applyLivePatch(patch: LiveStorePatch, opts: { viaAssistant?: boolean } = {}) {
    const replace = new Set(patch.replace ?? [])
    const mark = new Set(opts.viaAssistant === false ? [] : patch.created ?? [])
    if (replace.has('mail')) { mails.value = []; sent.value = []; drafts.value = [] }
    if (replace.has('calendar')) { events.value = []; deletedEvents.value = [] }
    if (replace.has('slack')) { slackChannels.value = []; slackMessages.value = []; slackDrafts.value = {} }
    if (replace.has('discord')) { discordChannels.value = []; discordMessages.value = [] }

    if (patch.mails) upsert(mails.value, patch.mails.map(m => ({ ...m })))
    if (patch.removeDraftIds?.length) {
      const gone = drafts.value.filter(d => patch.removeDraftIds!.includes(d.id))
      drafts.value = drafts.value.filter(d => !patch.removeDraftIds!.includes(d.id))
      // A sent draft keeps the reply link the store knew about.
      for (const s of patch.sent ?? []) if (!s.replyToId && gone.length === 1 && gone[0]!.replyToId) s.replyToId = gone[0]!.replyToId
    }
    if (patch.sent) upsert(sent.value, patch.sent.map(s => ({ ...s, ...(mark.has(s.id) ? { viaAssistant: true } : {}) })))
    if (patch.drafts) upsert(drafts.value, patch.drafts.map(d => ({ ...d })))

    if (patch.eventRange && patch.events) {
      const a = Date.parse(patch.eventRange.from)
      const b = Date.parse(patch.eventRange.to)
      const keep = new Set(patch.events.map(e => e.id))
      events.value = events.value.filter(e => keep.has(e.id) || !(Date.parse(e.start) < b && Date.parse(e.end) > a))
    }
    if (patch.events) upsert(events.value, patch.events.map(e => ({ ...e })))
    for (const id of patch.removeEventIds ?? []) {
      const i = events.value.findIndex(e => e.id === id)
      if (i >= 0) deletedEvents.value.push(...events.value.splice(i, 1))
    }

    if (patch.slackChannels) slackChannels.value = patch.slackChannels.map(c => ({ ...c }))
    if (patch.slackMessages) upsert(slackMessages.value, patch.slackMessages.map(m => ({ ...m, ...(mark.has(m.id) ? { viaAssistant: true } : {}) })))
    if (patch.discordChannels) discordChannels.value = patch.discordChannels.map(c => ({ ...c }))
    if (patch.discordMessages) upsert(discordMessages.value, patch.discordMessages.map(m => ({ ...m, ...(mark.has(m.id) ? { viaAssistant: true } : {}) })))
  }

  function addDraft(d: Omit<MailDraft, 'id' | 'createdAt'>): MailDraft {
    const draft = { ...d, id: `draft-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() }
    drafts.value.push(draft)
    return draft
  }

  function addEvent(e: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const ev = { ...e, id: `ev-${crypto.randomUUID().slice(0, 8)}` }
    events.value.push(ev)
    return ev
  }

  const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`

  function addSent(m: Omit<SentMail, 'id' | 'sentAt'>): SentMail {
    const item = { ...m, id: uid('sent'), sentAt: new Date().toISOString() }
    sent.value.push(item)
    return item
  }

  function addReminder(r: { title: string, at: string }): Reminder {
    const item: Reminder = { ...r, id: uid('rem'), createdAt: new Date().toISOString(), status: 'pending' }
    reminders.value.push(item)
    return item
  }

  /** The mailbox owner's display name ("Kim Jiwoo <...>" -> "Kim Jiwoo"); follows the demo language. */
  function userName(): string {
    const to = mails.value[0]?.to ?? ''
    return to.replace(/\s*<[^>]*>\s*/, '').trim() || 'Me'
  }

  function postChat(service: 'slack' | 'discord', channelId: string, text: string): ChatMessage {
    const msg: ChatMessage = { id: uid(service === 'slack' ? 'slm-me' : 'dcm-me'), channelId, author: userName(), text, at: new Date().toISOString(), viaAssistant: true }
    if (service === 'slack') slackMessages.value.push(msg)
    else discordMessages.value.push(msg)
    return msg
  }

  function setSlackDraft(channelId: string, text: string) {
    slackDrafts.value = { ...slackDrafts.value, [channelId]: text }
  }

  return {
    mails, drafts, events, slackChannels, slackMessages, slackDrafts, discordChannels, discordMessages, files,
    sent, deletedEvents, reminders, live,
    seed, setLive, applyLivePatch, addDraft, addEvent, setSlackDraft, addSent, addReminder, userName, postChat,
  }
})
