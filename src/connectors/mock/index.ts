import type { MockOps } from '../types'
import { calendarConflicts, calendarCreateEvent, calendarDeleteEvent, calendarList } from './calendar'
import { discordChannels, discordPost, discordRead, slackChannels, slackDraftReply, slackPost, slackRead } from './chat'
import { driveRead, driveSearch } from './drive'
import { mailCreateDraft, mailList, mailRead, mailReply, mailRestore, mailSend, mailSendDraft, mailTrash } from './mail'
import { reminderCancel, reminderCreate, reminderList } from './reminders'

/** One mock per CONNECTOR_OPS entry, backed by the demo session store. */
export const MOCK_OPS: MockOps = {
  mail_list: mailList,
  mail_read: mailRead,
  mail_create_draft: mailCreateDraft,
  mail_send: mailSend,
  mail_reply: mailReply,
  mail_send_draft: mailSendDraft,
  mail_trash: mailTrash,
  mail_restore: mailRestore,
  calendar_list: calendarList,
  calendar_conflicts: calendarConflicts,
  calendar_create_event: calendarCreateEvent,
  calendar_delete_event: calendarDeleteEvent,
  reminder_create: reminderCreate,
  reminder_list: reminderList,
  reminder_cancel: reminderCancel,
  slack_channels: slackChannels,
  slack_read: slackRead,
  slack_draft_reply: slackDraftReply,
  slack_post: slackPost,
  discord_channels: discordChannels,
  discord_read: discordRead,
  discord_post: discordPost,
  drive_search: driveSearch,
  drive_read: driveRead,
}
