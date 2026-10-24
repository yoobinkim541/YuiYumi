// Visible acting: when the agent runs a tool, the virtual desktop shows it. The app window
// comes to the front, the avatar slides aside so both stay visible, text is typed into the
// app's composer, and the result is revealed (Sent folder, channel, calendar day).
// Every step is optional and silently skipped when the window does not exist.

import { reactive } from 'vue'
import { getOpSpec, type ConnectorGrade, type ConnectorOpName, type MoveTarget } from '@shared/contracts'
import type { ToolOutcome } from '@/connectors/registry'
import { useDemo } from '@/stores/demo'
import {
  assistantWindow, CHARACTER_H, CHARACTER_W, desktop, DESKTOP_H, DESKTOP_W, DOCK_H, focusWindow, MENUBAR_H, moveAssistantWindow,
  type UserAppId,
} from './windows'

/** What the agent is doing on screen right now. Apps and the confirm card read this. */
export const stage = reactive({
  /** Window the agent is working in (the confirm card is placed over it). */
  target: null as UserAppId | null,
  /** Text being typed into an app composer by the agent. */
  typing: null as null | {
    app: UserAppId
    op: ConnectorOpName
    text: string
    /** Mail being replied to, or Slack/Discord channel. */
    mailId?: string
    channelId?: string
    to?: string
    subject?: string
  },
  /** Last completed action, for apps to jump to the result. Bumps `seq` on every change. */
  reveal: null as null | { seq: number, op: ConnectorOpName, app: UserAppId, data: Record<string, unknown>, input: Record<string, unknown> },
  /** Day shown by the Calendar app (null = today). */
  calendarDay: null as string | null,
})

let revealSeq = 0

const APP_BY_PREFIX: [string, UserAppId][] = [
  ['mail_', 'mail'], ['calendar_', 'calendar'], ['slack_', 'slack'], ['discord_', 'discord'], ['drive_', 'drive'],
]

export function appForOp(op: string): UserAppId | null {
  return APP_BY_PREFIX.find(([p]) => op.startsWith(p))?.[1] ?? null
}

/** Text the agent "types" for an op, if any. */
function typedText(op: ConnectorOpName, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? input[k] as string : '')
  switch (op) {
    case 'mail_reply': case 'mail_send': case 'mail_create_draft': return s('body')
    case 'slack_post': case 'slack_draft_reply': case 'discord_post': return s('text')
    default: return ''
  }
}

// ---------------------------------------------------------------------------
// Avatar placement

/** Usable desktop area between the menu bar and the Dock. */
const AREA = { top: MENUBAR_H, bottom: DESKTOP_H - DOCK_H }
const MARGIN = 24
const SIDE_Y = DESKTOP_H - DOCK_H - CHARACTER_H - 8

export function positionFor(where: MoveTarget): { x: number, y: number } {
  switch (where) {
    case 'left': return { x: MARGIN, y: SIDE_Y }
    case 'right': return { x: DESKTOP_W - CHARACTER_W - MARGIN, y: SIDE_Y }
    case 'corner': return { x: DESKTOP_W - CHARACTER_W - 36, y: DESKTOP_H - CHARACTER_H - 120 }
    case 'center':
    default:
      return { x: (DESKTOP_W - CHARACTER_W) / 2, y: AREA.top + (AREA.bottom - AREA.top - CHARACTER_H) / 2 }
  }
}

export function moveAssistantTo(where: MoveTarget): void {
  const p = positionFor(where)
  moveAssistantWindow(p.x, p.y)
}

/**
 * Avatar position beside a window rect: the side with more free room, clamped to the
 * desktop. When neither side has room it hugs the far edge (overlapping the window edge).
 */
export function asidePosition(win: { x: number, w: number }): { x: number, y: number } {
  const leftRoom = win.x
  const rightRoom = DESKTOP_W - (win.x + win.w)
  const x = rightRoom >= leftRoom
    ? Math.min(win.x + win.w + 12, DESKTOP_W - CHARACTER_W - 8)
    : Math.max(win.x - CHARACTER_W - 12, 8)
  return { x, y: SIDE_Y }
}

function slideAside(app: UserAppId): void {
  const w = desktop.windows[app]
  if (!w) return
  const target = asidePosition(w)
  const overlaps = assistantWindow.x < w.x + w.w && assistantWindow.x + CHARACTER_W > w.x
  if (!overlaps && Math.abs(assistantWindow.y - target.y) < 200) return
  moveAssistantWindow(target.x, target.y)
}

// ---------------------------------------------------------------------------
// Timing helpers (instant under test)

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
export const TYPE_MS = 1000
const SLIDE_MS = 450
const REVEAL_MS = 700

async function typeOut(full: string): Promise<void> {
  if (!stage.typing) return
  const steps = Math.min(30, Math.max(1, full.length))
  const per = Math.ceil(full.length / steps)
  for (let i = 1; i <= steps; i++) {
    if (!stage.typing) return
    stage.typing.text = full.slice(0, i * per)
    await sleep(TYPE_MS / steps)
  }
  if (stage.typing) stage.typing.text = full
}

// ---------------------------------------------------------------------------
// The actuator the agent loop calls around each tool

export const desktopActuator = {
  async before(op: ConnectorOpName, input: Record<string, unknown>, grade: ConnectorGrade): Promise<void> {
    const app = appForOp(op)
    if (!app || !desktop.windows[app]) return
    const wasOpen = desktop.windows[app].open && desktop.focused === app
    focusWindow(app)
    stage.target = app
    if (grade === 'read') {
      if (!wasOpen) await sleep(250)
      return
    }
    slideAside(app)
    if (op === 'calendar_create_event' && typeof input.start === 'string') stage.calendarDay = input.start
    if (op === 'calendar_delete_event') {
      const ev = useDemo().events.find(e => e.id === input.id)
      if (ev) stage.calendarDay = ev.start
    }
    await sleep(SLIDE_MS)
    const text = typedText(op, input)
    if (text) {
      stage.typing = {
        app, op, text: '',
        mailId: typeof input.id === 'string' ? input.id : typeof input.replyToId === 'string' ? input.replyToId : undefined,
        channelId: typeof input.channelId === 'string' ? input.channelId : undefined,
        to: typeof input.to === 'string' ? input.to : undefined,
        subject: typeof input.subject === 'string' ? input.subject : undefined,
      }
      await typeOut(text)
    }
  },

  async after(op: ConnectorOpName, input: Record<string, unknown>, outcome: ToolOutcome | null): Promise<void> {
    const app = appForOp(op)
    stage.typing = null
    if (!app || !outcome || !outcome.ok || getOpSpec(op)?.grade === 'read') return
    const data = (outcome.data ?? {}) as Record<string, unknown>
    stage.reveal = { seq: ++revealSeq, op, app, data, input }
    await sleep(REVEAL_MS)
  },
}

/** Clears the stage when a task ends. */
export function resetStage(): void {
  stage.target = null
  stage.typing = null
}
