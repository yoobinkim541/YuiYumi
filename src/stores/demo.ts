// Session data behind the virtual desktop. The desktop apps render it and the mock
// connectors read and write it, so what the observer sees on screen and what the agent
// reads through tools are the same data.

import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  function seed(data: Partial<{
    mails: Mail[], events: CalendarEvent[], slackChannels: ChatChannel[], slackMessages: ChatMessage[],
    discordChannels: ChatChannel[], discordMessages: ChatMessage[], files: DriveFile[]
  }>) {
    if (data.mails) mails.value = data.mails
    if (data.events) events.value = data.events
    if (data.slackChannels) slackChannels.value = data.slackChannels
    if (data.slackMessages) slackMessages.value = data.slackMessages
    if (data.discordChannels) discordChannels.value = data.discordChannels
    if (data.discordMessages) discordMessages.value = data.discordMessages
    if (data.files) files.value = data.files
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
    sent, deletedEvents, reminders,
    seed, addDraft, addEvent, setSlackDraft, addSent, addReminder, userName, postChat,
  }
})
