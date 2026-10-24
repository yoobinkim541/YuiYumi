import { ConnectorError, type MockOp } from '../types'

const RELATIVE = /^\s*(?:in\s+)?(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)\s*(?:later|from now)?\s*$/i

/** Resolves "in N minutes" (seconds/hours too) or an ISO 8601 date-time to epoch ms. */
export function parseReminderAt(at: string, now: Date): number {
  const m = RELATIVE.exec(at)
  if (m) {
    const n = Number(m[1])
    const unit = m[2]!.toLowerCase()
    const ms = unit.startsWith('h') ? 3_600_000 : unit.startsWith('m') ? 60_000 : 1000
    return now.getTime() + Math.round(n * ms)
  }
  const t = Date.parse(at)
  if (Number.isNaN(t)) throw new ConnectorError(`Invalid time "${at}". Use ISO 8601 with offset or "in N minutes".`)
  return t
}

export const reminderCreate: MockOp<'reminder_create'> = (demo, input, now = new Date()) => {
  const t = parseReminderAt(input.at, now)
  if (t <= now.getTime() - 1000) throw new ConnectorError('Reminder time is in the past.')
  const r = demo.addReminder({ title: input.title, at: new Date(t).toISOString() })
  return { reminderId: r.id, title: r.title, at: r.at, inSeconds: Math.round((t - now.getTime()) / 1000) }
}

export const reminderList: MockOp<'reminder_list'> = demo => ({
  reminders: demo.reminders.filter(r => r.status === 'pending').map(r => ({ id: r.id, title: r.title, at: r.at })),
})

export const reminderCancel: MockOp<'reminder_cancel'> = (demo, input) => {
  const r = demo.reminders.find(x => x.id === input.id && x.status === 'pending')
  if (!r) throw new ConnectorError(`No pending reminder with id "${input.id}".`)
  r.status = 'cancelled'
  return { reminderId: r.id, cancelled: true }
}
