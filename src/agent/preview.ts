// Human-readable preview of a write tool call, shown on the confirm card.

import type { ConnectorOpName } from '@shared/contracts'
import type { PreviewField } from './confirm-queue'

export function buildWritePreview(
  op: ConnectorOpName,
  input: Record<string, unknown>,
  channelName: (channelId: string) => string | undefined = () => undefined,
): PreviewField[] {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (op) {
    case 'mail_create_draft':
      return [
        { field: 'to', value: s('to') },
        { field: 'subject', value: s('subject') },
        { field: 'body', value: s('body'), multiline: true },
      ]
    case 'calendar_create_event':
      return [
        { field: 'title', value: s('title') },
        { field: 'start', value: s('start') },
        { field: 'end', value: s('end') },
      ]
    case 'slack_draft_reply': {
      const id = s('channelId')
      const name = channelName(id)
      return [
        { field: 'channel', value: name ? `#${name}` : id },
        { field: 'text', value: s('text'), multiline: true },
      ]
    }
    default:
      // Any future write op still gets a card with its raw input.
      return [{ field: 'text', value: JSON.stringify(input, null, 2), multiline: true }]
  }
}
