// Desktop build stand-in for src/desktop/actuator.ts (aliased in vite.config.ts, desktop
// mode). There is no virtual desktop to act on: the agent's tools run without on-screen
// choreography and the confirm card keeps its own spot.

import { reactive } from 'vue'
import type { ConnectorGrade, ConnectorOpName } from '@shared/contracts'
import type { ToolOutcome } from '@/connectors/registry'

export const stage = reactive({
  target: null as null,
  typing: null as null,
  reveal: null as null,
  calendarDay: null as string | null,
})

export const desktopActuator = {
  async before(_op: ConnectorOpName, _input: Record<string, unknown>, _grade: ConnectorGrade): Promise<void> {},
  async after(_op: ConnectorOpName, _input: Record<string, unknown>, _outcome: ToolOutcome | null): Promise<void> {},
}

export function resetStage(): void {}
