// Wire contracts between the browser and the api/ functions. Provider-neutral: no
// Anthropic, Deepgram or ElevenLabs types cross this boundary.

import { z } from 'zod'
import { LANGS } from './languages.js'

export const LangSchema = z.enum(LANGS)

/** `curious`: the user is doing something interesting, surprising or fun on screen. */
export const EMOTIONS = ['neutral', 'happy', 'thinking', 'surprised', 'sorry', 'focused', 'curious'] as const
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
  /** Seconds since the character last said a line (reply or proactive); null if not yet. */
  secondsSinceLastLine: z.number().nullable(),
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

/** Model that runs tasks (Settings > General). The observer (vision) is always Haiku. */
export const AGENT_MODELS = ['sonnet', 'opus'] as const
export type AgentModel = (typeof AGENT_MODELS)[number]

/** Where the browser loop runs: the web demo (virtual PC) or the desktop app (real computer). */
export const HOST_KINDS = ['web', 'desktop'] as const
export type HostKind = (typeof HOST_KINDS)[number]
export const HOST_APP_NAME_MAX = 80
export const HOST_APPS_MAX = 400

export const HostContextSchema = z.object({
  kind: z.enum(HOST_KINDS),
  /** Desktop: installed app names for open_app (the client trims the list). */
  apps: z.array(z.string().max(HOST_APP_NAME_MAX)).max(HOST_APPS_MAX).optional(),
})
export type HostContext = z.infer<typeof HostContextSchema>

export const AgentStepRequestSchema = z.object({
  lang: LangSchema,
  origin: z.enum(['utterance', 'screen']),
  /** Anthropic-shaped message params, passed through as-is. */
  messages: z.array(z.unknown()).min(1),
  sessionId: z.string(),
  persona: PersonaSchema.optional(),
  model: z.enum(AGENT_MODELS).optional(),
  /** Missing: an older client, treated as the web demo. */
  host: HostContextSchema.optional(),
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

/**
 * Every op acts on the virtual PC (demo store). When the user connected the provider of a
 * service, the op runs on the user's real account through /api/connectors/<service> and the
 * result is mirrored into the demo store; otherwise it runs on the mock data.
 */
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

// ---------------------------------------------------------------------------
// Host tools: act on the computer the loop runs on. The browser implements them per host
// (src/agent/host-tools.ts for the web demo, src/desktop-app/agent-host.ts for the desktop
// app); the server writes their descriptions per host (server/prompts/agent.ts).
//
// Grades: computer_task is write-level work, but the loop shows no confirm card for it.
// The worker behind it asks per action instead (the desktop agent runtime's permission
// prompts, docs/agent-runtime.md section 4; the web studio gets the permission level), so a
// card here would ask twice. open_url / open_app are read-level: they change nothing, and
// open_url only ever opens http(s) URLs.

export type HostToolName = 'computer_task' | 'open_url' | 'open_app'

export interface HostToolSpec<I extends z.ZodType = z.ZodType> {
  name: HostToolName
  grade: ConnectorGrade
  input: I
}

const hostTool = <I extends z.ZodType>(s: HostToolSpec<I>) => s

export const HOST_TOOLS = [
  hostTool({
    name: 'computer_task',
    grade: 'write',
    input: z.object({
      request: z.string().min(1).max(8000),
      /** Subfolder of the chosen project folder to work in (a plain folder name). */
      project: z.string().max(80).optional(),
    }),
  }),
  hostTool({ name: 'open_url', grade: 'read', input: z.object({ url: z.string().min(1).max(2048) }) }),
  hostTool({ name: 'open_app', grade: 'read', input: z.object({ name: z.string().min(1).max(100) }) }),
] as const

export const HOST_TOOL_NAMES = HOST_TOOLS.map(t => t.name) as HostToolName[]
export const getHostToolSpec = (name: string) => HOST_TOOLS.find(t => t.name === name)

/** Normalized http(s) URL, or null for anything else (file:, javascript:, data:, custom schemes). */
export function webUrl(raw: string): string | null {
  let s = raw.trim()
  // "youtube.com" style input: assume https.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/:?#]|$)/i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname || u.username || u.password) return null
    return u.href
  } catch {
    return null
  }
}

/** A project subfolder name the loop may pass on: one plain path segment. */
export function projectSubfolder(raw: string | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s || s.startsWith('.') || !/^[\p{L}\p{N} ._-]{1,80}$/u.test(s)) return null
  return s
}

export const LiveConnectorRequestSchema = z.object({
  op: z.string(),
  input: z.unknown(),
  sessionId: z.string(),
})

// ---------------------------------------------------------------------------
// Live connectors: each user connects their own accounts (OAuth). Tokens stay in sealed
// httpOnly cookies; the browser only learns which providers are connected.

export const LIVE_PROVIDERS = ['google', 'slack', 'discord'] as const
export type LiveProvider = (typeof LIVE_PROVIDERS)[number]
export type LiveService = 'mail' | 'calendar' | 'slack' | 'discord'
export const LIVE_SERVICE_LIST: LiveService[] = ['mail', 'calendar', 'slack', 'discord']
export const PROVIDER_OF: Record<LiveService, LiveProvider> = { mail: 'google', calendar: 'google', slack: 'slack', discord: 'discord' }

/** Extra live ops outside the agent registry: initial load and the opt-in sample data. */
export const LIVE_SNAPSHOT_OP = 'snapshot'
export const LIVE_SAMPLES_ADD_OP = 'samples_add'
export const LIVE_SAMPLES_REMOVE_OP = 'samples_remove'

/** GET /api/auth/status. No tokens: connection state and a display name only. */
export interface AuthStatus {
  providers: Record<LiveProvider, {
    /** The server has the OAuth client configured for this provider. */
    available: boolean
    connected: boolean
    /** Account email (Google), workspace (Slack) or server name (Discord). */
    account?: string
    /** Services usable with the granted scopes. */
    services: LiveService[]
  }>
  limits: { outboundPerSession: number, outboundPerAccountDaily: number }
}

// Store-shaped items the live endpoint returns so the virtual desktop can mirror them.
export interface LiveMail { id: string, from: string, to: string, subject: string, body: string, receivedAt: string, lang: string, read: boolean, spam?: boolean, trashed?: boolean }
export interface LiveSentMail { id: string, replyToId?: string, to: string, subject: string, body: string, sentAt: string }
export interface LiveDraft { id: string, replyToId?: string, to: string, subject: string, body: string, createdAt: string }
export interface LiveEvent { id: string, title: string, start: string, end: string, location?: string }
export interface LiveChannel { id: string, name: string, workspace: string }
export interface LiveChatMessage { id: string, channelId: string, author: string, text: string, at: string }

/** Changes to mirror into the demo store. Items are upserted by id unless noted. */
export interface LiveStorePatch {
  /** Snapshot: these services' collections are replaced, not merged. */
  replace?: LiveService[]
  mails?: LiveMail[]
  sent?: LiveSentMail[]
  drafts?: LiveDraft[]
  removeDraftIds?: string[]
  events?: LiveEvent[]
  /** `events` is the complete list for this range: other events inside it are dropped. */
  eventRange?: { from: string, to: string }
  removeEventIds?: string[]
  slackChannels?: LiveChannel[]
  slackMessages?: LiveChatMessage[]
  discordChannels?: LiveChannel[]
  discordMessages?: LiveChatMessage[]
  /** Ids of items this op created (sent mail, chat posts): shown with the assistant marker. */
  created?: string[]
}

/** POST /api/connectors/<service> response. `result` has the same shape as the mock op. */
export interface LiveConnectorResponse {
  result: unknown
  patch?: LiveStorePatch
}

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
  /**
   * `budget` means the daily or session cap was reached; the client falls back to prepared lines.
   * `not_connected`: the user has not connected (or revoked) the provider. `rejected`: a live
   * connector refused the op (unknown id, cap reached); the message is meant for the user.
   */
  code?: 'budget' | 'bad_request' | 'provider' | 'unconfigured' | 'not_connected' | 'rejected'
}
