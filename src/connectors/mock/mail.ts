import { ConnectorError, type MockOp } from '../types'

const snippet = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, ' ')

export const mailList: MockOp<'mail_list'> = (demo, input) => {
  const limit = input.limit ?? 20
  const messages = [...demo.mails]
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, limit)
    .map(m => ({
      id: m.id,
      from: m.from,
      subject: m.subject,
      receivedAt: m.receivedAt,
      read: m.read,
      lang: m.lang,
      ...(m.spam ? { spam: true } : {}),
      snippet: snippet(m.body),
    }))
  return { messages }
}

export const mailRead: MockOp<'mail_read'> = (demo, input) => {
  const m = demo.mails.find(x => x.id === input.id)
  if (!m) throw new ConnectorError(`No message with id "${input.id}".`)
  m.read = true
  return { id: m.id, from: m.from, to: m.to, subject: m.subject, receivedAt: m.receivedAt, lang: m.lang, ...(m.spam ? { spam: true } : {}), body: m.body }
}

export const mailCreateDraft: MockOp<'mail_create_draft'> = (demo, input) => {
  if (input.replyToId && !demo.mails.some(x => x.id === input.replyToId)) {
    throw new ConnectorError(`No message with id "${input.replyToId}" to reply to.`)
  }
  const d = demo.addDraft({ replyToId: input.replyToId, to: input.to, subject: input.subject, body: input.body })
  return { draftId: d.id, savedAsDraft: true, sent: false }
}
