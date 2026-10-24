// Slack Web API with the signed-in user's token (OAuth v2 user scopes), so reads cover the
// user's channels and posts go out as the user. Results use the mock op shapes.

import type { LiveChannel, LiveChatMessage, LiveConnectorResponse, LiveStorePatch } from '../shared/contracts.js'
import { mapLimit } from './google.js'
import { env, NotConnectedError, RejectedError, UpstreamError } from './http.js'

const API = 'https://slack.com/api'

/** User scopes requested on "Add to Slack". */
export const SLACK_USER_SCOPES = ['channels:read', 'channels:history', 'groups:read', 'groups:history', 'chat:write', 'users:read']

export const slackAvailable = () => Boolean(env('SLACK_CLIENT_ID') && env('SLACK_CLIENT_SECRET'))

/** Sealed per-user Slack credential. */
export interface SlackCred { p: 'slack', token: string, team: string, teamId: string, user: string }

const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive'])
const USER_ERRORS: Record<string, string> = {
  channel_not_found: 'No channel with that id in this workspace.',
  not_in_channel: 'You are not a member of that channel.',
  is_archived: 'That channel is archived.',
  msg_too_long: 'The message is too long.',
  restricted_action: 'This workspace does not allow posting there.',
}

interface SlackOk { ok: boolean, error?: string }

export async function slackCall<T>(token: string, method: string, params: Record<string, string> = {}, post?: unknown): Promise<T> {
  const url = post === undefined ? `${API}/${method}?${new URLSearchParams(params)}` : `${API}/${method}`
  const res = await fetch(url, {
    method: post === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, ...(post !== undefined ? { 'content-type': 'application/json; charset=utf-8' } : {}) },
    ...(post !== undefined ? { body: JSON.stringify(post) } : {}),
  })
  if (!res.ok) throw new UpstreamError(`slack ${method} HTTP ${res.status}`)
  const data = await res.json() as SlackOk & T
  if (!data.ok) {
    const err = data.error ?? 'error'
    if (AUTH_ERRORS.has(err)) throw new NotConnectedError('Slack access expired or was revoked. Connect Slack again.')
    if (err === 'missing_scope') throw new NotConnectedError('A Slack permission is missing. Connect Slack again.')
    if (USER_ERRORS[err]) throw new RejectedError(USER_ERRORS[err], 400)
    throw new UpstreamError(`slack ${method}: ${err}`)
  }
  return data
}

/** OAuth v2 code exchange; keeps the user token only. */
export async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackCred> {
  const res = await fetch(`${API}/oauth.v2.access`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('SLACK_CLIENT_ID') ?? '', client_secret: env('SLACK_CLIENT_SECRET') ?? '', code, redirect_uri: redirectUri }),
  })
  const data = await res.json().catch(() => ({})) as SlackOk & { authed_user?: { id: string, access_token?: string }, team?: { id: string, name: string } }
  if (!res.ok || !data.ok || !data.authed_user?.access_token) throw new UpstreamError(`slack oauth: ${data.error ?? res.status}`)
  return { p: 'slack', token: data.authed_user.access_token, team: data.team?.name ?? 'Slack', teamId: data.team?.id ?? '', user: data.authed_user.id }
}

export async function revokeSlack(cred: SlackCred): Promise<void> {
  await slackCall(cred.token, 'auth.revoke').catch(() => undefined)
}

// ---------------------------------------------------------------------------

interface SlackChannel { id: string, name: string, is_member?: boolean }
interface SlackMessage { ts: string, user?: string, username?: string, bot_id?: string, text?: string, subtype?: string, bot_profile?: { name?: string }, user_profile?: { display_name?: string, real_name?: string } }

const names = new Map<string, string>()

/** Display name of a user id (users:read), cached per workspace; the id when unavailable. */
async function userName(cred: SlackCred, id: string): Promise<string> {
  const key = `${cred.teamId}:${id}`
  const hit = names.get(key)
  if (hit) return hit
  const r = await slackCall<{ user?: { name?: string, real_name?: string, profile?: { display_name?: string, real_name?: string } } }>(cred.token, 'users.info', { user: id })
    .catch(() => ({ user: undefined }))
  const name = r.user?.profile?.display_name || r.user?.profile?.real_name || r.user?.real_name || r.user?.name || id
  names.set(key, name)
  return name
}

/** Slack text escapes (&amp; &lt; &gt;) back to plain text. */
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** Plain text to Slack text: escaping also stops <!channel> style broadcasts and links. */
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function channelList(cred: SlackCred): Promise<LiveChannel[]> {
  const data = await slackCall<{ channels: SlackChannel[] }>(cred.token, 'conversations.list', {
    types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200',
  })
  return data.channels.filter(c => c.is_member !== false).map(c => ({ id: c.id, name: c.name, workspace: cred.team }))
}

async function history(cred: SlackCred, channelId: string, limit: number): Promise<LiveChatMessage[]> {
  const data = await slackCall<{ messages: SlackMessage[] }>(cred.token, 'conversations.history', { channel: channelId, limit: String(limit) })
  const list = data.messages.filter(m => !m.subtype || m.subtype === 'bot_message' || m.subtype === 'thread_broadcast')
  const out = await mapLimit(list, 4, async m => ({
    id: m.ts,
    channelId,
    author: m.user_profile?.display_name || m.user_profile?.real_name || m.bot_profile?.name || m.username
      || (m.user ? await userName(cred, m.user) : m.bot_id ?? 'unknown'),
    text: unescape(m.text ?? ''),
    at: new Date(Number(m.ts) * 1000).toISOString(),
  }))
  return out.reverse() // API is newest first; mock and UI use oldest first.
}

export async function slackChannels(cred: SlackCred): Promise<LiveConnectorResponse> {
  const channels = await channelList(cred)
  return { result: { channels }, patch: { slackChannels: channels } }
}

async function channelInfo(cred: SlackCred, channelId: string): Promise<LiveChannel> {
  const r = await slackCall<{ channel: SlackChannel }>(cred.token, 'conversations.info', { channel: channelId })
  return { id: r.channel.id, name: r.channel.name, workspace: cred.team }
}

export async function slackRead(cred: SlackCred, input: { channelId: string, limit?: number }): Promise<LiveConnectorResponse> {
  const [channel, messages] = await Promise.all([channelInfo(cred, input.channelId), history(cred, input.channelId, input.limit ?? 20)])
  return { result: { channel, messages: messages.map(({ channelId: _c, ...m }) => m) }, patch: { slackMessages: messages } }
}

export async function slackPost(cred: SlackCred, input: { channelId: string, text: string }): Promise<LiveConnectorResponse> {
  const channel = await channelInfo(cred, input.channelId)
  const r = await slackCall<{ ts: string, channel: string }>(cred.token, 'chat.postMessage', {}, {
    channel: channel.id, text: escape(input.text), unfurl_links: false, unfurl_media: false,
  })
  const author = await userName(cred, cred.user)
  const msg: LiveChatMessage = { id: r.ts, channelId: channel.id, author, text: input.text, at: new Date(Number(r.ts) * 1000).toISOString() }
  return { result: { messageId: r.ts, posted: true, channel: channel.name, author }, patch: { slackMessages: [msg], created: [r.ts] } }
}

/** Initial load: the user's channels and recent messages of the first few. */
export async function slackSnapshot(cred: SlackCred): Promise<LiveStorePatch> {
  const channels = await channelList(cred)
  const lists = await mapLimit(channels.slice(0, 8), 3, c => history(cred, c.id, 30).catch(() => [] as LiveChatMessage[]))
  return { replace: ['slack'], slackChannels: channels, slackMessages: lists.flat() }
}
