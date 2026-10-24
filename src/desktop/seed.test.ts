import { describe, expect, it } from 'vitest'
import { LANGS } from '@shared/languages'
import { buildDemoData, DEMO_LANGS, reseedDemoData, scenarioTexts } from './seed'

const NOW = new Date('2026-10-24T11:00:00')

const ids = (lang: (typeof LANGS)[number]) => {
  const d = buildDemoData(NOW, lang)
  return [d.mails, d.events, d.slackChannels, d.slackMessages, d.discordChannels, d.discordMessages, d.files]
    .map(list => list.map(x => x.id))
}

describe('localized demo seed', () => {
  it('has a complete dataset for every supported language', () => {
    expect(DEMO_LANGS).toEqual([...LANGS])
  })

  it('uses the same ids in every language', () => {
    for (const lang of LANGS) expect(ids(lang)).toEqual(ids('en'))
  })

  it('keeps the storyline: one spam mail, a 15:00 conflict and the quote request', () => {
    for (const lang of LANGS) {
      const d = buildDemoData(NOW, lang)
      expect(d.mails.every(m => m.lang === lang)).toBe(true)
      expect(d.mails.filter(m => m.spam).map(m => m.id)).toEqual(['mail-spam-001'])
      const at15 = d.events.filter(e => new Date(e.start).getHours() === 15 && new Date(e.start).getMinutes() === 0)
      expect(at15.map(e => e.id).sort()).toEqual(['ev-003', 'ev-004'])
      expect(d.slackMessages.some(m => m.channelId === 'sl-orbit')).toBe(true)
      expect(scenarioTexts(lang).mail.subject.length).toBeGreaterThan(0)
    }
  })

  it('keeps session state when the language changes', () => {
    const ko = buildDemoData(NOW, 'ko')
    ko.mails[0]!.read = true
    ko.mails.push({ ...ko.mails[0]!, id: 'mail-live-1', read: false })
    ko.events.push({ id: 'ev-added', title: 'Added', start: ko.events[0]!.start, end: ko.events[0]!.end })
    ko.slackMessages.push({ id: 'slm-live-1', channelId: 'sl-orbit', author: 'x', text: 'y', at: NOW.toISOString() })
    const ja = reseedDemoData(NOW, 'ja', ko)
    expect(ja.mails[0]!.read).toBe(true)
    expect(ja.mails.find(m => m.id === 'mail-live-1')?.subject).toBe(scenarioTexts('ja').mail.subject)
    expect(ja.events.some(e => e.id === 'ev-added')).toBe(true)
    expect(ja.slackMessages.find(m => m.id === 'slm-live-1')?.text).toBe(scenarioTexts('ja').slack.text)
  })
})
