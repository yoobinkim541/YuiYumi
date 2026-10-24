// Read-only Discord REST access for the live connector. Only GET requests (guild channel
// list, channel messages); there is no posting endpoint in this file by design.

import { env } from './http'
import { UpstreamError } from './slack'

const API = 'https://discord.com/api/v10'

export const discordConfigured = () => Boolean(env('DISCORD_BOT_TOKEN') && env('DISCORD_GUILD_ID'))

async function discordGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'GET', headers: { authorization: `Bot ${env('DISCORD_BOT_TOKEN')}` } })
  if (!res.ok) throw new UpstreamError(`discord GET ${path.split('?')[0]} HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface DiscordChannel { id: string, name: string, type: number }
interface DiscordMessage { id: string, content: string, timestamp: string, author: { username: string, global_name?: string | null } }

/** Text (0) and announcement (5) channels of the configured guild. */
async function guildTextChannels(): Promise<DiscordChannel[]> {
  const guild = env('DISCORD_GUILD_ID')!
  const list = await discordGet<DiscordChannel[]>(`/guilds/${encodeURIComponent(guild)}/channels`)
  return list.filter(c => c.type === 0 || c.type === 5)
}

export async function discordChannels() {
  const workspace = env('DISCORD_GUILD_NAME') ?? 'Discord'
  const channels = (await guildTextChannels()).map(c => ({ id: c.id, name: c.name, workspace }))
  return { channels }
}

export async function discordRead(channelId: string, limit = 20) {
  // Only channels of the configured guild can be read.
  const ch = (await guildTextChannels()).find(c => c.id === channelId)
  if (!ch) throw new UpstreamError('channel not allowed', 403)
  const list = await discordGet<DiscordMessage[]>(`/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`)
  const messages = list
    .map(m => ({ id: m.id, author: m.author.global_name || m.author.username, text: m.content, at: m.timestamp }))
    .reverse() // API is newest first; mock and UI use oldest first.
  return { channel: { id: ch.id, name: ch.name, workspace: env('DISCORD_GUILD_NAME') ?? 'Discord' }, messages }
}
