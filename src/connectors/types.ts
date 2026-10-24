import type { useDemo } from '@/stores/demo'

export type DemoStore = ReturnType<typeof useDemo>

// Input shapes mirroring the zod schemas in shared/contracts.ts CONNECTOR_OPS. The contract's
// ConnectorOpName widens to `string`, so the per-op types are restated here; inputs are
// always validated at runtime against the contract schemas before reaching a mock.
type Range = { from: string, to: string }
type ChannelRead = { channelId: string, limit?: number }

export interface OpInputs {
  mail_list: { limit?: number }
  mail_read: { id: string }
  mail_create_draft: { replyToId?: string, to: string, subject: string, body: string }
  calendar_list: Range
  calendar_conflicts: Range
  calendar_create_event: { title: string, start: string, end: string }
  slack_channels: Record<string, never>
  slack_read: ChannelRead
  slack_draft_reply: { channelId: string, text: string }
  discord_channels: Record<string, never>
  discord_read: ChannelRead
  drive_search: { query: string }
  drive_read: { id: string }
}

export type OpName = keyof OpInputs
export type OpInput<N extends OpName> = OpInputs[N]

/** A mock implementation of one operation. Results are plain JSON. */
export type MockOp<N extends OpName> = (demo: DemoStore, input: OpInput<N>) => unknown

export type MockOps = { [N in OpName]: MockOp<N> }

/** Thrown for expected, user-facing failures (unknown id, bad range). */
export class ConnectorError extends Error {}
