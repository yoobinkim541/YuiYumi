import { useDemo } from '@/stores/demo'
import { startScenario } from './scenario'
import { buildDemoData } from './seed'

export { getActivity } from './activity'
export { notify } from './notifications'
export { desktop, focusWindow } from './windows'

let initialized = false

export function initDesktop(): void {
  if (initialized) return
  initialized = true
  useDemo().seed(buildDemoData(new Date()))
  startScenario()
}
