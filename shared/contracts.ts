// Wire contracts between the browser and the api/ functions. Provider-neutral: no
// Anthropic, Deepgram or ElevenLabs types cross this boundary.

import { z } from 'zod'
import { LANGS } from './languages'

export const LangSchema = z.enum(LANGS)

export const EMOTIONS = ['neutral', 'happy', 'thinking', 'surprised', 'sorry', 'focused'] as const
export const EmotionSchema = z.enum(EMOTIONS)
export type Emotion = z.infer<typeof EmotionSchema>

// ---------------------------------------------------------------------------
// Persona: user-editable character card appended to the system prompts. It can shape
// tone and identity only; the server keeps its fixed rules above it.

export const PersonaSchema = z.object({
  name: z.string().max(40),
  prompt: z.string().max(4000),
  speakingStyle: z.string().max(400).optional(),
})
export type Persona = z.infer<typeof PersonaSchema>

// ---------------------------------------------------------------------------
// Observer (Haiku): screen frame + state -> react / delegate_task

export const ObserveStateSchema = z.object({
  activeApp: z.string().nullable(),
  windowTitle: z.string().nullable(),
  dwellSec: z.number(),
  minutesSinceLastInterjection: z.number().nullable(),
  interjectionsToday: z.number().int(),
  typing: z.boolean(),
  userSpeaking: z.boolean(),
})
export type ObserveState = z.infer<typeof ObserveStateSchema>

export const DialogueTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
})
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>

export const ObserveRequestSchema = z.object({
  frame: z.object({
    jpegBase64: z.string(),
    width: z.number().int(),
    height: z.number().int(),
  }).nullable(),
  state: ObserveStateSchema,
  /** Present when the user just spoke (STT result). */
  utterance: z.string().optional(),
  lang: LangSchema,
  recent: z.array(DialogueTurnSchema).max(20),
  sessionId: z.string(),
  persona: PersonaSchema.optional(),
})
export type ObserveRequest = z.infer<typeof ObserveRequestSchema>

/** Tool input schemas exposed to the observer model. */
export const ReactInputSchema = z.object({
  emotion: EmotionSchema,
  line: z.string().max(200).optional(),
  motion: z.string().optional(),
})
export const DelegateTaskInputSchema = z.object({
  request: z.string().max(1000),
  /** One short sentence in the user's language, shown on the suggestion card. */
  summary: z.string().max(200).optional(),
})
export const MOVE_TARGETS = ['left', 'right', 'center', 'corner'] as const
export const MoveSelfInputSchema = z.object({
  where: z.enum(MOVE_TARGETS),
})
export type MoveTarget = (typeof MOVE_TARGETS)[number]

export const ObserveActionSchema = z.discriminatedUnion('type', [
  ReactInputSchema.extend({ type: z.literal('react') }),
  DelegateTaskInputSchema.extend({ type: z.literal('delegate_task') }),
  MoveSelfInputSchema.extend({ type: z.literal('move_self') }),
])
export type ObserveAction = z.infer<typeof ObserveActionSchema>

export const ObserveResponseSchema = z.object({
  actions: z.array(ObserveActionSchema),
})
export type ObserveResponse = z.infer<typeof ObserveResponseSchema>

// ---------------------------------------------------------------------------
// Agent (Sonnet): one model call per request. The browser runs tools and loops.

export type DelegateOrigin = 'utterance' | 'screen'

export const AgentStepRequestSchema = z.object({
  lang: LangSchema,
  origin: z.enum(['utterance', 'screen']),
  /** Anthropic-shaped message params, passed through as-is. */
  messages: z.array(z.unknown()).min(1),
  sessionId: z.string(),
  persona: PersonaSchema.optional(),
})
export type AgentStepRequest = z.infer<typeof AgentStepRequestSchema>

export interface AgentStepResponse {
  /** Anthropic-shaped content blocks of the assistant turn. */
  content: unknown[]
  stopReason: string | null
}

// ---------------------------------------------------------------------------
// Connectors: one registry of operations, exposed to the agent as tools.

export type ConnectorService = 'mail' | 'calendar' | 'drive' | 'slack' | 'discord' | 'reminders'
/**
 * read: no side effects. write: local and reversible (drafts, calendar add/delete,
 * reminders, trash/restore). outbound: leaves the user (send or reply mail, post to chat).
 */
export type ConnectorGrade = 'read' | 'write' | 'outbound'

/** User-selected permission level (Settings > Permissions). */
export const PERMISSION_LEVELS = ['manual', 'auto', 'bypass'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

/** manual: confirm write + outbound. auto: confirm outbound only. bypass: never confirm. */
export function requiresConfirmation(grade: ConnectorGrade, level: PermissionLevel): boolean {
  if (grade === 'read' || level === 'bypass') return false
  if (level === 'auto') return grade === 'outbound'
  return true
}

export interface ConnectorOpSpec<I extends z.ZodType = z.ZodType> {
  name: string
  service: ConnectorService
  grade: ConnectorGrade
  description: string
  input: I
}

const op = <I extends z.ZodType>(s: ConnectorOpSpec<I>) => s

const Range = z.object({ from: z.string(), to: z.string() })
const ChannelRead = z.object({ channelId: z.string(), limit: z.number().int().min(1).max(50).optional() })
const ChannelPost = z.object({ channelId: z.string(), text: z.string().min(1).max(2000) })

/** Every op acts on the in-page virtual PC (demo store). Live Slack/Discord stay read-only. */
export const CONNECTOR_OPS = [
  op({ name: 'mail_list', service: 'mail', grade: 'read', description: 'List mail messages (newest first). folder: inbox (default), sent, drafts, trash, spam.', input: z.object({ limit: z.number().int().min(1).max(50).optional(), folder: z.enum(['inbox', 'sent', 'drafts', 'trash', 'spam']).optional() }) }),
  op({ name: 'mail_read', service: 'mail', grade: 'read', description: 'Read one message by id.', input: z.object({ id: z.string() }) }),
  op({ name: 'mail_create_draft', service: 'mail', grade: 'write', description: 'Save a mail draft (new or reply). Does not send.', input: z.object({ replyToId: z.string().optional(), to: z.string(), subject: z.string(), body: z.string() }) }),
  op({ name: 'mail_send', service: 'mail', grade: 'outbound', description: 'Send a new mail message.', input: z.object({ to: z.string(), subject: z.string(), body: z.string() }) }),
  op({ name: 'mail_reply', service: 'mail', grade: 'outbound', description: 'Reply to a received mail and send it. Subject defaults to "Re: <original>".', input: z.object({ id: z.string(), body: z.string(), subject: z.string().optional() }) }),
  op({ name: 'mail_send_draft', service: 'mail', grade: 'outbound', description: 'Send an existing draft by draft id.', input: z.object({ draftId: z.string() }) }),
  op({ name: 'mail_trash', service: 'mail', grade: 'write', description: 'Move a received mail to Trash (reversible with mail_restore).', input: z.object({ id: z.string() }) }),
  op({ name: 'mail_restore', service: 'mail', grade: 'write', description: 'Restore a mail from Trash.', input: z.object({ id: z.string() }) }),
  op({ name: 'calendar_list', service: 'calendar', grade: 'read', description: 'List events in a date range (ISO dates).', input: Range }),
  op({ name: 'calendar_conflicts', service: 'calendar', grade: 'read', description: 'Find overlapping events in a date range.', input: Range }),
  op({ name: 'calendar_create_event', service: 'calendar', grade: 'write', description: 'Create a calendar event (ISO 8601 date-times with offset).', input: z.object({ title: z.string(), start: z.string(), end: z.string() }) }),
  op({ name: 'calendar_delete_event', service: 'calendar', grade: 'write', description: 'Delete a calendar event by id (kept in a deleted list, reversible).', input: z.object({ id: z.string() }) }),
  op({ name: 'reminder_create', service: 'reminders', grade: 'write', description: 'Set a reminder. at: ISO 8601 date-time with offset, or "in N minutes" / "in N seconds" / "in N hours".', input: z.object({ at: z.string(), title: z.string().min(1).max(200) }) }),
  op({ name: 'reminder_list', service: 'reminders', grade: 'read', description: 'List pending reminders.', input: z.object({}) }),
  op({ name: 'reminder_cancel', service: 'reminders', grade: 'write', description: 'Cancel a pending reminder by id.', input: z.object({ id: z.string() }) }),
  op({ name: 'slack_channels', service: 'slack', grade: 'read', description: 'List connected Slack channels.', input: z.object({}) }),
  op({ name: 'slack_read', service: 'slack', grade: 'read', description: 'Read recent messages of a Slack channel.', input: ChannelRead }),
  op({ name: 'slack_draft_reply', service: 'slack', grade: 'write', description: 'Put text into the Slack composer as a draft. Does not post.', input: z.object({ channelId: z.string(), text: z.string() }) }),
  op({ name: 'slack_post', service: 'slack', grade: 'outbound', description: 'Post a message to a Slack channel as the user.', input: ChannelPost }),
  op({ name: 'discord_channels', service: 'discord', grade: 'read', description: 'List connected Discord channels.', input: z.object({}) }),
  op({ name: 'discord_read', service: 'discord', grade: 'read', description: 'Read recent messages of a Discord channel.', input: ChannelRead }),
  op({ name: 'discord_post', service: 'discord', grade: 'outbound', description: 'Post a message to a Discord channel as the user.', input: ChannelPost }),
  op({ name: 'drive_search', service: 'drive', grade: 'read', description: 'Search files by keyword.', input: z.object({ query: z.string() }) }),
  op({ name: 'drive_read', service: 'drive', grade: 'read', description: 'Read a file by id.', input: z.object({ id: z.string() }) }),
] as const

export type ConnectorOpName = (typeof CONNECTOR_OPS)[number]['name']
export const CONNECTOR_OP_NAMES = CONNECTOR_OPS.map(o => o.name) as ConnectorOpName[]
export const getOpSpec = (name: string) => CONNECTOR_OPS.find(o => o.name === name)

export const LiveConnectorRequestSchema = z.object({
  op: z.string(),
  input: z.unknown(),
  sessionId: z.string(),
})

// ---------------------------------------------------------------------------
// Voice. STT: the browser POSTs a 16 kHz mono WAV body to /api/stt?lang=<Lang>.

export const TranscriptSchema = z.object({
  text: z.string(),
  confidence: z.number().nullable(),
  lang: LangSchema,
})
export type Transcript = z.infer<typeof TranscriptSchema>

/** Voice style presets: lively (default, ~0.6 s), conversational (most natural, ~3-4 s), fast (~0.4 s, flatter). */
export const VOICE_PRESETS = ['lively', 'conversational', 'fast'] as const
export type VoicePreset = (typeof VOICE_PRESETS)[number]

/** TTS: POST JSON to /api/tts, response body is audio/mpeg. */
export const SpeechRequestSchema = z.object({
  text: z.string().min(1).max(500),
  lang: LangSchema,
  emotion: EmotionSchema.optional(),
  /** Character speaking; selects its voice (ELEVENLABS_VOICE_<ID>) before the per-language voice. */
  character: z.enum(['tt2', 'yui']).optional(),
  preset: z.enum(VOICE_PRESETS).optional(),
  sessionId: z.string(),
})
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>

// ---------------------------------------------------------------------------

export interface ApiError {
  error: string
  /** `budget` means the daily or session cap was reached; the client falls back to prepared lines. */
  code?: 'budget' | 'bad_request' | 'provider' | 'unconfigured'
}
