// Scripted demo arrivals: a Slack message and a new mail. Each one is written to the demo
// store (so the apps and connectors see it) and announced with a notification banner.
// `?scenario=off` disables it; `?scenarioSpeed=N` divides the delays (for testing).

import { useDemo } from '@/stores/demo'
import { useSettings } from '@/stores/settings'
import { notify } from './notifications'
import { scenarioTexts } from './seed'

export const SLACK_DELAY_MS = 25_000
export const MAIL_DELAY_MS = 50_000

let started = false
const timers: ReturnType<typeof setTimeout>[] = []

export function startScenario(): void {
  if (started) return
  const params = new URLSearchParams(location.search)
  if (params.get('scenario') === 'off') return
  started = true
  const speed = Math.max(1, Number(params.get('scenarioSpeed')) || 1)
  timers.push(setTimeout(arriveSlack, SLACK_DELAY_MS / speed))
  timers.push(setTimeout(arriveMail, MAIL_DELAY_MS / speed))
}

export function stopScenario(): void {
  timers.splice(0).forEach(clearTimeout)
  started = false
}

function arriveSlack(): void {
  const demo = useDemo()
  const t = scenarioTexts(useSettings().lang).slack
  demo.slackMessages.push({
    id: `slm-live-${Date.now()}`,
    channelId: 'sl-orbit',
    author: t.author,
    text: t.text,
    at: new Date().toISOString(),
  })
  notify({ app: 'Slack', title: t.notifyTitle, body: t.text, target: 'slack' })
}

function arriveMail(): void {
  const demo = useDemo()
  const lang = useSettings().lang
  const t = scenarioTexts(lang).mail
  demo.mails.push({
    id: `mail-live-${Date.now()}`,
    from: t.from,
    to: t.to,
    subject: t.subject,
    body: t.body,
    receivedAt: new Date().toISOString(),
    lang,
    read: false,
  })
  notify({ app: 'Mail', title: t.notifyTitle, body: t.subject, target: 'mail' })
}
