// Read-only Slack Web API access for the live connector. Only conversations.list and
// conversations.history are called; there is no posting endpoint in this file by design.

import { env } from './http'

const API = 'https://slack.com/api'

export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) { super(message) }
}

export const slackConfigured = () => Boolean(env('SLACK_BOT_TOKEN'))

/** Optional comma-separated allowlist of channel ids (SLACK_CHANNEL_IDS). */
function allowedChannels(): Set<string> | null {
  const v = env('SLACK_CHANNEL_IDS')
  return v ? new Set(v.split(',').map(s => s.trim()).filter(Boolean)) : null
}

async function slackGet<T>(method: 'conversations.list' | 'conversations.history', params: Record<string, string>): Promise<T> {
  const url = `${API}/${method}?${new URLSearchParams(params)}`
  const res = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${env('SLACK_BOT_TOKEN')}` } })
  if (!res.ok) throw new UpstreamError(`slack ${method} HTTP ${res.status}`)
  const data = await res.json() as { ok: boolean, error?: string } & T
  if (!data.ok) throw new UpstreamError(`slack ${method}: ${data.error ?? 'error'}`)
  return data
}

interface SlackChannel { id: string, name: string, is_member?: boolean }
interface SlackMessage { ts: string, user?: string, username?: string, bot_id?: string, text?: string, subtype?: string, user_profile?: { display_name?: string, real_name?: string } }

export async function slackChannels() {
  const data = await slackGet<{ channels: SlackChannel[] }>('conversations.list', {
    types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200',
  })
  const allow = allowedChannels()
  const workspace = env('SLACK_WORKSPACE_NAME') ?? 'Slack'
  const channels = data.channels
    .filter(c => (allow ? allow.has(c.id) : c.is_member !== false))
    .map(c => ({ id: c.id, name: c.name, workspace }))
  return { channels }
}

export async function slackRead(channelId: string, limit = 20) {
  const allow = allowedChannels()
  if (allow && !allow.has(channelId)) throw new UpstreamError('channel not allowed', 403)
  const data = await slackGet<{ messages: SlackMessage[] }>('conversations.history', { channel: channelId, limit: String(limit) })
  const messages = data.messages
    .filter(m => !m.subtype || m.subtype === 'bot_message' || m.subtype === 'thread_broadcast')
    .map(m => ({
      id: m.ts,
      author: m.user_profile?.display_name || m.user_profile?.real_name || m.username || m.user || m.bot_id || 'unknown',
      text: m.text ?? '',
      at: new Date(Number(m.ts) * 1000).toISOString(),
    }))
    .reverse() // API is newest first; mock and UI use oldest first.
  return { channel: { id: channelId }, messages }
}
