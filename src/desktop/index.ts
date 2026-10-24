import { watch } from 'vue'
import { useDemo } from '@/stores/demo'
import { useSettings } from '@/stores/settings'
import { startScenario } from './scenario'
import { buildDemoData, reseedDemoData } from './seed'

export { getActivity } from './activity'
export { notify } from './notifications'
export { desktop, focusWindow } from './windows'

let initialized = false

export function initDesktop(): void {
  if (initialized) return
  initialized = true
  const demo = useDemo()
  const settings = useSettings()
  const seedTime = new Date()
  demo.seed(buildDemoData(seedTime, settings.lang))
  // Demo content follows the UI language. Drafts, Slack drafts, added events and
  // scenario arrivals survive the switch.
  watch(() => settings.lang, (lang) => {
    demo.seed(reseedDemoData(seedTime, lang, { mails: demo.mails, events: demo.events, slackMessages: demo.slackMessages }))
  })
  startScenario()
}
