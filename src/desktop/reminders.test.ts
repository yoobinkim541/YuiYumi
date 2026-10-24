import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { requiresConfirmation, PERMISSION_LEVELS, type ConnectorGrade } from '@shared/contracts'
import { parseReminderAt } from '@/connectors/mock/reminders'
import { useDemo } from '@/stores/demo'
import { asidePosition, positionFor } from './actuator'
import { dueReminders } from './reminders'
import { CHARACTER_W, DESKTOP_W } from './windows'

describe('reminder scheduling', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('parses relative times in seconds, minutes and hours', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(parseReminderAt('in 1 minute', now) - now.getTime()).toBe(60_000)
    expect(parseReminderAt('in 30 seconds', now) - now.getTime()).toBe(30_000)
    expect(parseReminderAt('2 hours', now) - now.getTime()).toBe(7_200_000)
    expect(parseReminderAt('2026-10-24T21:30:00+09:00', now)).toBe(Date.parse('2026-10-24T12:30:00Z'))
    expect(() => parseReminderAt('tomorrowish', now)).toThrow()
  })

  it('reports only pending reminders whose time has come', () => {
    const demo = useDemo()
    const a = demo.addReminder({ title: 'a', at: '2026-10-24T12:00:00Z' })
    demo.addReminder({ title: 'b', at: '2026-10-24T12:05:00Z' })
    const c = demo.addReminder({ title: 'c', at: '2026-10-24T11:00:00Z' })
    c.status = 'cancelled'
    expect(dueReminders(demo.reminders, Date.parse('2026-10-24T12:01:00Z')).map(r => r.title)).toEqual([a.title])
  })
})

describe('permission matrix', () => {
  it('manual confirms write + outbound, auto outbound only, bypass nothing; read never', () => {
    const table: Record<string, Record<ConnectorGrade, boolean>> = {
      manual: { read: false, write: true, outbound: true },
      auto: { read: false, write: false, outbound: true },
      bypass: { read: false, write: false, outbound: false },
    }
    for (const level of PERMISSION_LEVELS) {
      for (const grade of ['read', 'write', 'outbound'] as const) {
        expect(requiresConfirmation(grade, level), `${level}/${grade}`).toBe(table[level]![grade])
      }
    }
  })
})

describe('avatar placement', () => {
  it('moves to named spots and steps aside to the roomier side of a window', () => {
    expect(positionFor('left').x).toBeLessThan(100)
    expect(positionFor('right').x).toBe(DESKTOP_W - CHARACTER_W - 24)
    expect(positionFor('center').x).toBe((DESKTOP_W - CHARACTER_W) / 2)
    // Mail (left half) -> avatar to its right; Calendar (right edge) -> avatar to its left.
    expect(asidePosition({ x: 36, w: 1140 }).x).toBe(36 + 1140 + 12)
    expect(asidePosition({ x: 1200, w: 690 }).x).toBe(1200 - CHARACTER_W - 12)
  })
})
