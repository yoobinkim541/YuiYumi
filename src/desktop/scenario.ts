// Scripted demo arrivals: a Slack message and a new mail. Each one is written to the demo
// store (so the apps and connectors see it) and announced with a notification banner.
// `?scenario=off` disables it; `?scenarioSpeed=N` divides the delays (for testing).

import { useDemo } from '@/stores/demo'
import { notify } from './notifications'

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
  const text = 'Heads-up: the Hoshizora review moved up to 4pm. Can someone drop the latest quote PDF in here before then?'
  demo.slackMessages.push({
    id: `slm-live-${Date.now()}`,
    channelId: 'sl-orbit',
    author: 'Daniel Wu',
    text,
    at: new Date().toISOString(),
  })
  notify({ app: 'Slack', title: 'Daniel Wu in #proj-orbit', body: text, target: 'slack' })
}

function arriveMail(): void {
  const demo = useDemo()
  const subject = 'Re: Orbit pricing - updated quote needed today'
  const body = 'Hi Alex,\n\nThanks for the call earlier. Could you send the updated Orbit quote with the volume discount by end of day? Our procurement meeting is tomorrow morning.\n\nBest regards,\nMisaki Sato\nHoshizora Systems'
  demo.mails.push({
    id: `mail-live-${Date.now()}`,
    from: 'Misaki Sato <misaki.sato@hoshizora-sys.example>',
    to: 'Alex Kim <alex.kim@aurora-lab.example>',
    subject,
    body,
    receivedAt: new Date().toISOString(),
    lang: 'en',
    read: false,
  })
  notify({ app: 'Mail', title: 'Misaki Sato', body: subject, target: 'mail' })
}
