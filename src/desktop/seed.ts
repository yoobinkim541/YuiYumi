// Builds the demo dataset from data/demo/<lang>/*.json with timestamps relative to `now`.
// Every language tells the same storyline and uses the same item ids, so agent tool calls
// and tests do not depend on the UI language.

import { DEFAULT_LANG, LANGS, type Lang } from '@shared/languages'
import type { CalendarEvent, ChatChannel, ChatMessage, DriveFile, Mail } from '@/stores/demo'

interface MailJson { mails: (Omit<Mail, 'receivedAt'> & { minutesAgo: number })[] }
interface CalendarJson { events: (Omit<CalendarEvent, 'start' | 'end'> & { dayOffset: number, start: string, end: string })[] }
interface ChatJson { channels: ChatChannel[], messages: (Omit<ChatMessage, 'at'> & { minutesAgo: number })[] }
interface DriveJson { files: (Omit<DriveFile, 'modifiedAt'> & { minutesAgo: number })[] }

/** Localized texts for the timed scenario arrivals (see scenario.ts). */
export interface ScenarioTexts {
  slack: { author: string, text: string, notifyTitle: string }
  mail: { from: string, to: string, subject: string, body: string, notifyTitle: string }
}

interface LangBundle {
  mails: MailJson
  calendar: CalendarJson
  slack: ChatJson
  discord: ChatJson
  drive: DriveJson
  scenario: ScenarioTexts
}

const modules = import.meta.glob('../../data/demo/*/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

function bundleFor(lang: Lang): LangBundle | null {
  const get = (name: string) => modules[`../../data/demo/${lang}/${name}.json`]
  const parts = ['mails', 'calendar', 'slack', 'discord', 'drive', 'scenario'].map(get)
  if (parts.some(p => !p)) return null
  const [mails, calendar, slack, discord, drive, scenario] = parts
  return { mails, calendar, slack, discord, drive, scenario } as LangBundle
}

/** Languages that have a complete demo dataset. */
export const DEMO_LANGS: Lang[] = LANGS.filter(l => bundleFor(l) !== null)

function resolveBundle(lang: Lang): LangBundle {
  const b = bundleFor(lang) ?? bundleFor('en') ?? bundleFor(DEFAULT_LANG)
  if (!b) throw new Error('No demo dataset found under data/demo/<lang>/')
  return b
}

export function scenarioTexts(lang: Lang): ScenarioTexts {
  return resolveBundle(lang).scenario
}

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

export function buildDemoData(now: Date = new Date(), lang: Lang = DEFAULT_LANG): DemoData {
  const b = resolveBundle(lang)
  const mails: Mail[] = b.mails.mails.map(({ minutesAgo, ...m }) => ({ ...m, receivedAt: ago(now, minutesAgo) }))
  const events: CalendarEvent[] = b.calendar.events.map(({ dayOffset, start, end, ...e }) => ({
    ...e,
    start: atLocal(now, dayOffset, start),
    end: atLocal(now, dayOffset, end),
  }))
  const msgs = (list: ChatJson['messages']): ChatMessage[] =>
    list.map(({ minutesAgo, ...m }) => ({ ...m, at: ago(now, minutesAgo) }))
  const files: DriveFile[] = b.drive.files.map(({ minutesAgo, ...f }) => ({ ...f, modifiedAt: ago(now, minutesAgo) }))
  return {
    mails,
    events,
    slackChannels: b.slack.channels.map(c => ({ ...c })),
    slackMessages: msgs(b.slack.messages),
    discordChannels: b.discord.channels.map(c => ({ ...c })),
    discordMessages: msgs(b.discord.messages),
    files,
  }
}

/** Current session state that survives a language switch. */
export interface SessionState {
  mails: Mail[]
  events: CalendarEvent[]
  slackMessages: ChatMessage[]
}

/**
 * Rebuilds the dataset in `lang` while keeping what happened in this session: read flags,
 * events added by the user or agent, and scenario arrivals (re-worded in the new language).
 * Drafts and Slack drafts are not part of the seed, so they are untouched.
 */
export function reseedDemoData(seedTime: Date, lang: Lang, prev: SessionState): DemoData {
  const next = buildDemoData(seedTime, lang)
  const sc = scenarioTexts(lang)
  const readById = new Map(prev.mails.map(m => [m.id, m.read]))
  next.mails = next.mails.map(m => (readById.has(m.id) ? { ...m, read: readById.get(m.id)! } : m))
  const seededMailIds = new Set(next.mails.map(m => m.id))
  for (const m of prev.mails) {
    if (seededMailIds.has(m.id)) continue
    next.mails.push(m.id.startsWith('mail-live-')
      ? { ...m, from: sc.mail.from, to: sc.mail.to, subject: sc.mail.subject, body: sc.mail.body, lang }
      : m)
  }
  const seededEventIds = new Set(next.events.map(e => e.id))
  next.events.push(...prev.events.filter(e => !seededEventIds.has(e.id)))
  const seededSlackIds = new Set(next.slackMessages.map(m => m.id))
  for (const m of prev.slackMessages) {
    if (seededSlackIds.has(m.id)) continue
    next.slackMessages.push(m.id.startsWith('slm-live-') ? { ...m, author: sc.slack.author, text: sc.slack.text } : m)
  }
  return next
}
