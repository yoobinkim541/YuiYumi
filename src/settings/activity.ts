// Session activity counters for the dashboard, fed by the bus. Counting starts when
// this module is first imported (the desktop imports the settings windows at startup).

import { reactive, watch } from 'vue'
import { bus } from '@/core/bus'
import { nunchiStatus } from '@/nunchi'

export interface ObserverDecision { at: number, decision: string }

export const activity = reactive({
  tasksRun: 0,
  tasksFromScreen: 0,
  lastDecision: null as ObserverDecision | null,
  /** Bumped when the dialogue may have changed, so the dashboard re-reads it. */
  dialogueTick: 0,
})

bus.on('agent:delegate', ({ origin }) => {
  activity.tasksRun++
  if (origin === 'screen') activity.tasksFromScreen++
})
bus.on('character:react', ({ line }) => { if (line) activity.dialogueTick++ })
bus.on('voice:transcript', () => { activity.dialogueTick++ })

// A decision lands when a request finishes (inFlight -> false) or the gate drops a check.
watch(() => [nunchiStatus.inFlight, nunchiStatus.last] as const, ([inFlight, last], prev) => {
  if (last === 'idle' || inFlight) return
  if (prev && !prev[0] && prev[1] === last) return
  activity.lastDecision = { at: Date.now(), decision: last }
})
