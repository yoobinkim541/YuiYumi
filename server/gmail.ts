// Gmail ops on the signed-in user's mailbox. Results use the mock op shapes
// (src/connectors/mock/mail.ts); patches carry store-shaped items for the virtual Mail app.

import type { LiveConnectorResponse, LiveDraft, LiveMail, LiveSentMail, LiveStorePatch } from '../shared/contracts.js'
import { mapLimit, orNotFound, type GoogleSession } from './google.js'
import { RejectedError } from './http.js'
import { buildMime, isEmail, parseAddressList, parseGmailMessage, toRaw, type GmailMessage, type ParsedMail } from './mime.js'

export const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'
const FOLDER_LABEL: Record<Exclude<MailFolder, 'drafts'>, string> = { inbox: 'INBOX', sent: 'SENT', trash: 'TRASH', spam: 'SPAM' }

const snippet = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, ' ')
export const replySubject = (subject: string) => (/^re:/i.test(subject) ? subject : `Re: ${subject}`)

// ---------------------------------------------------------------------------
// Mapping

export function toMail(p: ParsedMail): LiveMail {
  return {
    id: p.id, from: p.from, to: p.to, subject: p.subject, body: p.body, receivedAt: p.date, lang: p.lang,
    read: !p.labels.has('UNREAD'),
    ...(p.labels.has('SPAM') ? { spam: true } : {}),
    ...(p.labels.has('TRASH') ? { trashed: true } : {}),
  }
}

/** Sent and in no other mailbox: the virtual app shows it under Sent only. */
const isSentOnly = (p: ParsedMail) => p.labels.has('SENT') && !p.labels.has('INBOX')

function toSent(p: ParsedMail, replyToId?: string): LiveSentMail {
  return { id: p.id, ...(replyToId ? { replyToId } : {}), to: p.to, subject: p.subject, body: p.body, sentAt: p.date }
}

function toDraft(draftId: string, p: ParsedMail, replyToId?: string): LiveDraft {
  return { id: draftId, ...(replyToId ? { replyToId } : {}), to: p.to, subject: p.subject, body: p.body, createdAt: p.date }
}

const listView = (m: LiveMail) => ({
  id: m.id, from: m.from, subject: m.subject, receivedAt: m.receivedAt, read: m.read, lang: m.lang,
  ...(m.spam ? { spam: true } : {}), ...(m.trashed ? { trashed: true } : {}), snippet: snippet(m.body),
})
const sentView = (s: LiveSentMail) => ({ id: s.id, to: s.to, subject: s.subject, sentAt: s.sentAt, ...(s.replyToId ? { replyToId: s.replyToId } : {}), snippet: snippet(s.body) })
const draftView = (d: LiveDraft) => ({ draftId: d.id, to: d.to, subject: d.subject, ...(d.replyToId ? { replyToId: d.replyToId } : {}), snippet: snippet(d.body) })

// ---------------------------------------------------------------------------
// Fetching

async function listIds(s: GoogleSession, label: string, max: number): Promise<string[]> {
  const q = new URLSearchParams({ labelIds: label, maxResults: String(max) })
  if (label === 'TRASH' || label === 'SPAM') q.set('includeSpamTrash', 'true')
  const r = await s.api<{ messages?: { id: string }[] }>(`${GMAIL}/messages?${q}`)
  return (r.messages ?? []).map(m => m.id)
}

export async function getMessage(s: GoogleSession, id: string): Promise<ParsedMail> {
  const msg = await orNotFound(s.api<GmailMessage>(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`), `No message with id "${id}".`)
  return parseGmailMessage(msg)
}

const getMany = (s: GoogleSession, ids: string[]) => mapLimit(ids, 5, id => getMessage(s, id))

async function listDrafts(s: GoogleSession, max: number): Promise<{ draftId: string, p: ParsedMail }[]> {
  const r = await s.api<{ drafts?: { id: string }[] }>(`${GMAIL}/drafts?maxResults=${max}`)
  return mapLimit(r.drafts ?? [], 5, async (d) => {
    const full = await s.api<{ id: string, message: GmailMessage }>(`${GMAIL}/drafts/${encodeURIComponent(d.id)}?format=full`)
    return { draftId: full.id, p: parseGmailMessage(full.message) }
  })
}

/** Gmail id of the message an In-Reply-To header points at (same thread), if any. */
async function resolveReplyTo(s: GoogleSession, p: ParsedMail, known: Map<string, string>): Promise<string | undefined> {
  if (!p.inReplyTo) return undefined
  const hit = known.get(p.inReplyTo)
  if (hit) return hit
  if (!p.threadId) return undefined
  const t = await s.api<{ messages?: GmailMessage[] }>(`${GMAIL}/threads/${encodeURIComponent(p.threadId)}?format=metadata&metadataHeaders=Message-ID`)
    .catch(() => ({ messages: [] as GmailMessage[] }))
  for (const m of t.messages ?? []) {
    const mid = parseGmailMessage(m).messageId
    if (mid) known.set(mid, m.id)
  }
  return known.get(p.inReplyTo)
}

/** Recipient list check: at least one address, every one well formed. */
function checkRecipients(to: string): string {
  const list = parseAddressList(to)
  if (!list.length) throw new RejectedError('"to" is required.')
  const bad = list.find(a => !isEmail(a.email))
  if (bad) throw new RejectedError(`"${bad.email}" is not a valid email address.`)
  return to.trim()
}

async function send(s: GoogleSession, raw: string, threadId?: string): Promise<{ id: string, threadId: string }> {
  return s.api(`${GMAIL}/messages/send`, { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) } })
}

// ---------------------------------------------------------------------------
// Ops

export async function gmailList(s: GoogleSession, input: { limit?: number, folder?: MailFolder }): Promise<LiveConnectorResponse> {
  const limit = input.limit ?? 20
  const folder = input.folder ?? 'inbox'
  if (folder === 'drafts') {
    const known = new Map<string, string>()
    const drafts = await mapLimit(await listDrafts(s, limit), 3, async d => toDraft(d.draftId, d.p, await resolveReplyTo(s, d.p, known)))
    return { result: { folder, messages: drafts.map(draftView) }, patch: { drafts } }
  }
  const parsed = await getMany(s, await listIds(s, FOLDER_LABEL[folder], limit))
  if (folder === 'sent') {
    const known = new Map<string, string>()
    const sent = await mapLimit(parsed, 3, async p => toSent(p, await resolveReplyTo(s, p, known)))
    return { result: { folder, messages: sent.map(sentView) }, patch: { sent } }
  }
  const mails = parsed.map(toMail)
  return { result: { folder, messages: mails.map(listView) }, patch: { mails } }
}

export async function gmailRead(s: GoogleSession, input: { id: string }): Promise<LiveConnectorResponse> {
  const p = await getMessage(s, input.id)
  if (isSentOnly(p)) {
    const sent = toSent(p, await resolveReplyTo(s, p, new Map()))
    return { result: { id: p.id, folder: 'sent', to: p.to, subject: p.subject, sentAt: p.date, body: p.body }, patch: { sent: [sent] } }
  }
  if (p.labels.has('UNREAD')) {
    await s.api(`${GMAIL}/messages/${encodeURIComponent(p.id)}/modify`, { method: 'POST', body: { removeLabelIds: ['UNREAD'] } }).catch(() => undefined)
    p.labels.delete('UNREAD')
  }
  const m = toMail(p)
  return {
    result: { id: m.id, from: m.from, to: m.to, subject: m.subject, receivedAt: m.receivedAt, lang: m.lang, ...(m.spam ? { spam: true } : {}), ...(m.trashed ? { trashed: true } : {}), body: m.body },
    patch: { mails: [m] },
  }
}

/** Threading headers for a reply to `orig`. */
function replyHeaders(orig: ParsedMail) {
  return {
    ...(orig.messageId ? { inReplyTo: orig.messageId, references: [orig.references, orig.messageId].filter(Boolean).join(' ') } : {}),
  }
}

export async function gmailCreateDraft(s: GoogleSession, input: { replyToId?: string, to: string, subject: string, body: string }): Promise<LiveConnectorResponse> {
  const orig = input.replyToId ? await getMessage(s, input.replyToId) : null
  const raw = toRaw(buildMime({ to: input.to, subject: input.subject, body: input.body, ...(orig ? replyHeaders(orig) : {}) }))
  const d = await s.api<{ id: string }>(`${GMAIL}/drafts`, { method: 'POST', body: { message: { raw, ...(orig?.threadId ? { threadId: orig.threadId } : {}) } } })
  const draft: LiveDraft = { id: d.id, ...(orig ? { replyToId: orig.id } : {}), to: input.to, subject: input.subject, body: input.body, createdAt: new Date().toISOString() }
  return { result: { draftId: d.id, savedAsDraft: true, sent: false }, patch: { drafts: [draft] } }
}

export async function gmailSend(s: GoogleSession, input: { to: string, subject: string, body: string }): Promise<LiveConnectorResponse> {
  const to = checkRecipients(input.to)
  const r = await send(s, toRaw(buildMime({ to, subject: input.subject, body: input.body })))
  const sent: LiveSentMail = { id: r.id, to, subject: input.subject, body: input.body, sentAt: new Date().toISOString() }
  return { result: { sentId: r.id, sent: true, to, subject: input.subject }, patch: { sent: [sent], created: [r.id] } }
}

export async function gmailReply(s: GoogleSession, input: { id: string, body: string, subject?: string }): Promise<LiveConnectorResponse> {
  const orig = await getMessage(s, input.id)
  if (orig.labels.has('SPAM')) throw new RejectedError('Refusing to reply to a message flagged as spam.')
  const to = checkRecipients(orig.replyTo || orig.from)
  const subject = input.subject?.trim() || replySubject(orig.subject)
  const r = await send(s, toRaw(buildMime({ to, subject, body: input.body, ...replyHeaders(orig) })), orig.threadId || undefined)
  const sent: LiveSentMail = { id: r.id, replyToId: orig.id, to, subject, body: input.body, sentAt: new Date().toISOString() }
  return { result: { sentId: r.id, sent: true, inReplyTo: orig.id, to, subject }, patch: { sent: [sent], created: [r.id] } }
}

export async function gmailSendDraft(s: GoogleSession, input: { draftId: string }): Promise<LiveConnectorResponse> {
  const d = await orNotFound(s.api<{ id: string, message: GmailMessage }>(`${GMAIL}/drafts/${encodeURIComponent(input.draftId)}?format=full`), `No draft with id "${input.draftId}".`)
  const p = parseGmailMessage(d.message)
  checkRecipients(p.to)
  const r = await s.api<{ id: string }>(`${GMAIL}/drafts/send`, { method: 'POST', body: { id: d.id } })
  const sent: LiveSentMail = { id: r.id, to: p.to, subject: p.subject, body: p.body, sentAt: new Date().toISOString() }
  return { result: { sentId: r.id, sent: true, to: p.to, subject: p.subject }, patch: { sent: [sent], removeDraftIds: [d.id], created: [r.id] } }
}

export async function gmailTrash(s: GoogleSession, input: { id: string }): Promise<LiveConnectorResponse> {
  const before = await getMessage(s, input.id)
  await s.api(`${GMAIL}/messages/${encodeURIComponent(before.id)}/trash`, { method: 'POST' })
  before.labels.add('TRASH')
  return { result: { id: before.id, movedToTrash: true, subject: before.subject, reversible: true }, patch: { mails: [toMail(before)] } }
}

export async function gmailRestore(s: GoogleSession, input: { id: string }): Promise<LiveConnectorResponse> {
  const before = await getMessage(s, input.id)
  if (!before.labels.has('TRASH')) throw new RejectedError(`Message "${input.id}" is not in Trash.`)
  await s.api(`${GMAIL}/messages/${encodeURIComponent(before.id)}/untrash`, { method: 'POST' })
  before.labels.delete('TRASH')
  return { result: { id: before.id, restored: true, subject: before.subject }, patch: { mails: [toMail(before)] } }
}

/** Initial load for the virtual Mail app: inbox, junk, trash, sent and drafts. */
export async function gmailSnapshot(s: GoogleSession): Promise<LiveStorePatch> {
  const [inbox, spam, trash, sentIds, drafts] = await Promise.all([
    listIds(s, 'INBOX', 25), listIds(s, 'SPAM', 10), listIds(s, 'TRASH', 10), listIds(s, 'SENT', 15), listDrafts(s, 10),
  ])
  const received = await getMany(s, [...new Set([...inbox, ...spam, ...trash])])
  const sentParsed = await getMany(s, sentIds.filter(id => !received.some(r => r.id === id)))
  const known = new Map(received.filter(p => p.messageId).map(p => [p.messageId, p.id] as const))
  const byMessageId = (p: ParsedMail) => (p.inReplyTo ? known.get(p.inReplyTo) : undefined)
  return {
    replace: ['mail'],
    mails: received.map(toMail),
    sent: sentParsed.map(p => toSent(p, byMessageId(p))),
    drafts: drafts.map(d => toDraft(d.draftId, d.p, byMessageId(d.p))),
  }
}
