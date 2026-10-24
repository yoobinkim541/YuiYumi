// Discord through our bot. Discord does not let an app post as the user, so "Connect
// Discord" installs the bot into a server the user manages; the sealed credential holds that
// server's id and every op is limited to its text channels. Posts appear as the bot.

import type { LiveChannel, LiveChatMessage, LiveConnectorResponse, LiveStorePatch } from '../shared/contracts'
import { mapLimit } from './google'
import { env, NotConnectedError, RejectedError, UpstreamError } from './http'

const API = 'https://discord.com/api/v10'

/** View Channels (1024) + Send Messages (2048) + Read Message History (65536). */
export const DISCORD_BOT_PERMISSIONS = String(1024 + 2048 + 65536)
export const DISCORD_SCOPES = ['bot', 'identify', 'guilds']

export const discordAvailable = () => Boolean(env('DISCORD_CLIENT_ID') && env('DISCORD_CLIENT_SECRET') && env('DISCORD_BOT_TOKEN'))

/** Sealed per-user Discord credential: the server the user installed the bot into. */
export interface DiscordCred { p: 'discord', guildId: string, guildName: string, user: string }

async function bot<T>(path: string, init: { method?: string, body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bot ${env('DISCORD_BOT_TOKEN')}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (res.ok) return res.json() as Promise<T>
  const what = `discord ${init.method ?? 'GET'} ${path.split('?')[0]}`
  if (res.status === 403) throw new RejectedError('The YuiYumi bot cannot access that channel. Check its channel permissions.', 403)
  if (res.status === 404) throw new RejectedError('No channel with that id on the connected server.', 404)
  throw new UpstreamError(`${what} HTTP ${res.status}`)
}

/** OAuth code exchange for the bot install; the token response names the chosen server. */
export async function exchangeDiscordCode(code: string, redirectUri: string): Promise<DiscordCred> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: env('DISCORD_CLIENT_ID') ?? '', client_secret: env('DISCORD_CLIENT_SECRET') ?? '',
    }),
  })
  const data = await res.json().catch(() => ({})) as { access_token?: string, guild?: { id: string, name: string }, error?: string }
  if (!res.ok || !data.access_token) throw new UpstreamError(`discord oauth: ${data.error ?? res.status}`)
  if (!data.guild?.id) throw new UpstreamError('discord oauth: no server was selected')
  const me = await fetch(`${API}/users/@me`, { headers: { authorization: `Bearer ${data.access_token}` } })
    .then(r => (r.ok ? r.json() as Promise<{ username?: string, global_name?: string | null }> : {}))
    .catch(() => ({})) as { username?: string, global_name?: string | null }
  return { p: 'discord', guildId: data.guild.id, guildName: data.guild.name, user: me.global_name || me.username || '' }
}

interface DiscordChannel { id: string, name: string, type: number }
interface DiscordMessage { id: string, content: string, timestamp: string, author: { username: string, global_name?: string | null } }

/** Text (0) and announcement (5) channels of the connected server. */
async function guildTextChannels(cred: DiscordCred): Promise<DiscordChannel[]> {
  try {
    const list = await bot<DiscordChannel[]>(`/guilds/${encodeURIComponent(cred.guildId)}/channels`)
    return list.filter(c => c.type === 0 || c.type === 5)
  } catch (e) {
    // The bot was removed from the server: the connection is gone.
    if (e instanceof RejectedError) throw new NotConnectedError('The YuiYumi bot is no longer on that Discord server. Connect Discord again.')
    throw e
  }
}

const channelView = (cred: DiscordCred, c: DiscordChannel): LiveChannel => ({ id: c.id, name: c.name, workspace: cred.guildName })

async function ownChannel(cred: DiscordCred, channelId: string): Promise<DiscordChannel> {
  const ch = (await guildTextChannels(cred)).find(c => c.id === channelId)
  if (!ch) throw new RejectedError(`No channel with id "${channelId}" on the connected server.`, 404)
  return ch
}

async function messages(channelId: string, limit: number): Promise<LiveChatMessage[]> {
  const list = await bot<DiscordMessage[]>(`/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`)
  return list
    .map(m => ({ id: m.id, channelId, author: m.author.global_name || m.author.username, text: m.content, at: m.timestamp }))
    .reverse() // API is newest first; mock and UI use oldest first.
}

export async function discordChannels(cred: DiscordCred): Promise<LiveConnectorResponse> {
  const channels = (await guildTextChannels(cred)).map(c => channelView(cred, c))
  return { result: { channels }, patch: { discordChannels: channels } }
}

export async function discordRead(cred: DiscordCred, input: { channelId: string, limit?: number }): Promise<LiveConnectorResponse> {
  const ch = await ownChannel(cred, input.channelId)
  const list = await messages(ch.id, input.limit ?? 20)
  return { result: { channel: channelView(cred, ch), messages: list.map(({ channelId: _c, ...m }) => m) }, patch: { discordMessages: list } }
}

export async function discordPost(cred: DiscordCred, input: { channelId: string, text: string }): Promise<LiveConnectorResponse> {
  const ch = await ownChannel(cred, input.channelId)
  // No @everyone / role / user pings from the assistant.
  const m = await bot<DiscordMessage>(`/channels/${encodeURIComponent(ch.id)}/messages`, { method: 'POST', body: { content: input.text, allowed_mentions: { parse: [] } } })
  const author = m.author.global_name || m.author.username
  const msg: LiveChatMessage = { id: m.id, channelId: ch.id, author, text: m.content, at: m.timestamp }
  return { result: { messageId: m.id, posted: true, channel: ch.name, author }, patch: { discordMessages: [msg], created: [m.id] } }
}

export async function discordSnapshot(cred: DiscordCred): Promise<LiveStorePatch> {
  const channels = await guildTextChannels(cred)
  const lists = await mapLimit(channels.slice(0, 8), 3, c => messages(c.id, 30).catch(() => [] as LiveChatMessage[]))
  return { replace: ['discord'], discordChannels: channels.map(c => channelView(cred, c)), discordMessages: lists.flat() }
}
