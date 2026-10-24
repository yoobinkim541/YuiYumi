import type { ChatChannel, ChatMessage } from '@/stores/demo'
import { ConnectorError, type MockOp } from '../types'

const channelView = (c: ChatChannel) => ({ id: c.id, name: c.name, workspace: c.workspace })

function readChannel(channels: ChatChannel[], messages: ChatMessage[], channelId: string, limit = 20) {
  const ch = channels.find(c => c.id === channelId)
  if (!ch) throw new ConnectorError(`No channel with id "${channelId}".`)
  const list = messages
    .filter(m => m.channelId === channelId)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-limit)
    .map(m => ({ id: m.id, author: m.author, text: m.text, at: m.at }))
  return { channel: channelView(ch), messages: list }
}

export const slackChannels: MockOp<'slack_channels'> = demo => ({ channels: demo.slackChannels.map(channelView) })

export const slackRead: MockOp<'slack_read'> = (demo, input) =>
  readChannel(demo.slackChannels, demo.slackMessages, input.channelId, input.limit)

/** Fills the composer only; slack_post is the separate, outbound posting op. */
export const slackDraftReply: MockOp<'slack_draft_reply'> = (demo, input) => {
  if (!demo.slackChannels.some(c => c.id === input.channelId)) throw new ConnectorError(`No channel with id "${input.channelId}".`)
  demo.setSlackDraft(input.channelId, input.text)
  return { channelId: input.channelId, draftedInComposer: true, posted: false }
}

export const discordChannels: MockOp<'discord_channels'> = demo => ({ channels: demo.discordChannels.map(channelView) })

export const discordRead: MockOp<'discord_read'> = (demo, input) =>
  readChannel(demo.discordChannels, demo.discordMessages, input.channelId, input.limit)

export const slackPost: MockOp<'slack_post'> = (demo, input) => {
  const ch = demo.slackChannels.find(c => c.id === input.channelId)
  if (!ch) throw new ConnectorError(`No channel with id "${input.channelId}".`)
  const m = demo.postChat('slack', ch.id, input.text)
  if (demo.slackDrafts[ch.id]) demo.setSlackDraft(ch.id, '')
  return { messageId: m.id, posted: true, channel: ch.name, author: m.author }
}

export const discordPost: MockOp<'discord_post'> = (demo, input) => {
  const ch = demo.discordChannels.find(c => c.id === input.channelId)
  if (!ch) throw new ConnectorError(`No channel with id "${input.channelId}".`)
  const m = demo.postChat('discord', ch.id, input.text)
  return { messageId: m.id, posted: true, channel: ch.name, author: m.author }
}
