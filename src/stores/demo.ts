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

  function setSlackDraft(channelId: string, text: string) {
    slackDrafts.value = { ...slackDrafts.value, [channelId]: text }
  }

  return {
    mails, drafts, events, slackChannels, slackMessages, slackDrafts, discordChannels, discordMessages, files,
    seed, addDraft, addEvent, setSlackDraft,
  }
})
