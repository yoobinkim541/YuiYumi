import { useDemo } from '@/stores/demo'
import { buildDemoData } from './seed'

export { getActivity } from './activity'
export { desktop, focusWindow } from './windows'

let initialized = false

export function initDesktop(): void {
  if (initialized) return
  initialized = true
  useDemo().seed(buildDemoData(new Date()))
}
