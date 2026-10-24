// Human-readable preview of a write or outbound tool call, shown on the confirm card.

import type { ConnectorOpName } from '@shared/contracts'
import type { PreviewField } from './confirm-queue'

/** Lookups that turn ids into something a person can check. All optional. */
export interface PreviewLookup {
  channelName?: (channelId: string) => string | undefined
  mail?: (id: string) => { from: string, subject: string } | undefined
  draft?: (id: string) => { to: string, subject: string, body: string } | undefined
  event?: (id: string) => { title: string, start: string } | undefined
}

export function buildWritePreview(
  op: ConnectorOpName,
  input: Record<string, unknown>,
  lookup: PreviewLookup | ((channelId: string) => string | undefined) = {},
): PreviewField[] {
  const l: PreviewLookup = typeof lookup === 'function' ? { channelName: lookup } : lookup
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const channel = () => {
    const id = s('channelId')
    const name = l.channelName?.(id)
    return { field: 'channel' as const, value: name ? `#${name}` : id }
  }
  const mailLabel = (id: string) => {
    const m = l.mail?.(id)
    return m ? `${m.subject} — ${m.from}` : id
  }
  switch (op) {
    case 'mail_create_draft':
    case 'mail_send':
      return [
        { field: 'to', value: s('to') },
        { field: 'subject', value: s('subject') },
        { field: 'body', value: s('body'), multiline: true },
      ]
    case 'mail_reply': {
      const m = l.mail?.(s('id'))
      return [
        { field: 'to', value: m?.from ?? s('id') },
        { field: 'subject', value: s('subject') || (m ? (/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`) : '') },
        { field: 'body', value: s('body'), multiline: true },
      ]
    }
    case 'mail_send_draft': {
      const d = l.draft?.(s('draftId'))
      return d
        ? [{ field: 'to', value: d.to }, { field: 'subject', value: d.subject }, { field: 'body', value: d.body, multiline: true }]
        : [{ field: 'mail', value: s('draftId') }]
    }
    case 'mail_trash':
    case 'mail_restore':
      return [{ field: 'mail', value: mailLabel(s('id')) }]
    case 'calendar_create_event':
      return [
        { field: 'title', value: s('title') },
        { field: 'start', value: s('start') },
        { field: 'end', value: s('end') },
      ]
    case 'calendar_delete_event': {
      const e = l.event?.(s('id'))
      return e ? [{ field: 'title', value: e.title }, { field: 'start', value: e.start }] : [{ field: 'event', value: s('id') }]
    }
    case 'reminder_create':
      return [{ field: 'title', value: s('title') }, { field: 'at', value: s('at') }]
    case 'reminder_cancel':
      return [{ field: 'text', value: s('id') }]
    case 'slack_draft_reply':
    case 'slack_post':
    case 'discord_post':
      return [channel(), { field: 'text', value: s('text'), multiline: true }]
    default:
      // Any future op still gets a card with its raw input.
      return [{ field: 'text', value: JSON.stringify(input, null, 2), multiline: true }]
  }
}
