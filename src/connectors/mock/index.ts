import type { MockOps } from '../types'
import { calendarConflicts, calendarCreateEvent, calendarList } from './calendar'
import { discordChannels, discordRead, slackChannels, slackDraftReply, slackRead } from './chat'
import { driveRead, driveSearch } from './drive'
import { mailCreateDraft, mailList, mailRead } from './mail'

/** One mock per CONNECTOR_OPS entry, backed by the demo session store. */
export const MOCK_OPS: MockOps = {
  mail_list: mailList,
  mail_read: mailRead,
  mail_create_draft: mailCreateDraft,
  calendar_list: calendarList,
  calendar_conflicts: calendarConflicts,
  calendar_create_event: calendarCreateEvent,
  slack_channels: slackChannels,
  slack_read: slackRead,
  slack_draft_reply: slackDraftReply,
  discord_channels: discordChannels,
  discord_read: discordRead,
  drive_search: driveSearch,
  drive_read: driveRead,
}
