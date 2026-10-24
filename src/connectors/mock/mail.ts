import type { Mail } from '@/stores/demo'
import { ConnectorError, type DemoStore, type MockOp } from '../types'

const snippet = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, ' ')

const listView = (m: Mail) => ({
  id: m.id,
  from: m.from,
  subject: m.subject,
  receivedAt: m.receivedAt,
  read: m.read,
  lang: m.lang,
  ...(m.spam ? { spam: true } : {}),
  ...(m.trashed ? { trashed: true } : {}),
  snippet: snippet(m.body),
})

const byNewest = <T>(key: (x: T) => string) => (a: T, b: T) => Date.parse(key(b)) - Date.parse(key(a))

export const mailList: MockOp<'mail_list'> = (demo, input) => {
  const limit = input.limit ?? 20
  const folder = input.folder ?? 'inbox'
  if (folder === 'sent') {
    return { folder, messages: [...demo.sent].sort(byNewest(m => m.sentAt)).slice(0, limit).map(m => ({ id: m.id, to: m.to, subject: m.subject, sentAt: m.sentAt, ...(m.replyToId ? { replyToId: m.replyToId } : {}), snippet: snippet(m.body) })) }
  }
  if (folder === 'drafts') {
    return { folder, messages: [...demo.drafts].sort(byNewest(d => d.createdAt)).slice(0, limit).map(d => ({ draftId: d.id, to: d.to, subject: d.subject, ...(d.replyToId ? { replyToId: d.replyToId } : {}), snippet: snippet(d.body) })) }
  }
  // Inbox keeps spam visible but flagged (the agent must ignore it); trash and spam are separate views.
  const pick = folder === 'trash' ? (m: Mail) => !!m.trashed
    : folder === 'spam' ? (m: Mail) => !!m.spam && !m.trashed
      : (m: Mail) => !m.trashed
  return { folder, messages: demo.mails.filter(pick).sort(byNewest(m => m.receivedAt)).slice(0, limit).map(listView) }
}

export const mailRead: MockOp<'mail_read'> = (demo, input) => {
  const m = demo.mails.find(x => x.id === input.id)
  if (m) {
    m.read = true
    return { id: m.id, from: m.from, to: m.to, subject: m.subject, receivedAt: m.receivedAt, lang: m.lang, ...(m.spam ? { spam: true } : {}), ...(m.trashed ? { trashed: true } : {}), body: m.body }
  }
  const s = demo.sent.find(x => x.id === input.id)
  if (s) return { id: s.id, folder: 'sent', to: s.to, subject: s.subject, sentAt: s.sentAt, body: s.body }
  throw new ConnectorError(`No message with id "${input.id}".`)
}

function findMail(demo: DemoStore, id: string): Mail {
  const m = demo.mails.find(x => x.id === id)
  if (!m) throw new ConnectorError(`No message with id "${id}".`)
  return m
}

export const mailCreateDraft: MockOp<'mail_create_draft'> = (demo, input) => {
  if (input.replyToId) findMail(demo, input.replyToId)
  const d = demo.addDraft({ replyToId: input.replyToId, to: input.to, subject: input.subject, body: input.body })
  return { draftId: d.id, savedAsDraft: true, sent: false }
}

export const replySubject = (subject: string) => (/^re:/i.test(subject) ? subject : `Re: ${subject}`)

/** Shared send path: the agent (mail_send) and the user's own composer both land in Sent. */
export function sendMail(demo: DemoStore, input: { to: string, subject: string, body: string, replyToId?: string }, viaAssistant: boolean) {
  if (!input.to.trim()) throw new ConnectorError('"to" is required.')
  return demo.addSent({ ...(input.replyToId ? { replyToId: input.replyToId } : {}), to: input.to, subject: input.subject, body: input.body, viaAssistant })
}

/** Shared reply path (mail_reply and the user's Reply composer). */
export function replyToMail(demo: DemoStore, input: { id: string, body: string, subject?: string }, viaAssistant: boolean) {
  const m = findMail(demo, input.id)
  if (m.spam && viaAssistant) throw new ConnectorError('Refusing to reply to a message flagged as spam.')
  const subject = input.subject?.trim() || replySubject(m.subject)
  return demo.addSent({ replyToId: m.id, to: m.from, subject, body: input.body, viaAssistant })
}

export const mailSend: MockOp<'mail_send'> = (demo, input) => {
  const s = sendMail(demo, input, true)
  return { sentId: s.id, sent: true, to: s.to, subject: s.subject }
}

export const mailReply: MockOp<'mail_reply'> = (demo, input) => {
  const s = replyToMail(demo, input, true)
  return { sentId: s.id, sent: true, inReplyTo: s.replyToId, to: s.to, subject: s.subject }
}

export const mailSendDraft: MockOp<'mail_send_draft'> = (demo, input) => {
  const i = demo.drafts.findIndex(d => d.id === input.draftId)
  if (i < 0) throw new ConnectorError(`No draft with id "${input.draftId}".`)
  const d = demo.drafts[i]!
  demo.drafts.splice(i, 1)
  const s = demo.addSent({ replyToId: d.replyToId, to: d.to, subject: d.subject, body: d.body, viaAssistant: true })
  return { sentId: s.id, sent: true, to: s.to, subject: s.subject }
}

export const mailTrash: MockOp<'mail_trash'> = (demo, input) => {
  const m = findMail(demo, input.id)
  m.trashed = true
  return { id: m.id, movedToTrash: true, subject: m.subject, reversible: true }
}

export const mailRestore: MockOp<'mail_restore'> = (demo, input) => {
  const m = findMail(demo, input.id)
  if (!m.trashed) throw new ConnectorError(`Message "${input.id}" is not in Trash.`)
  m.trashed = false
  return { id: m.id, restored: true, subject: m.subject }
}
