// Dev-only console hook: __yuiStudio('간단한 할 일 앱 만들어줘') runs a studio task the way the
// agent's computer_task tool does, then says the summary like the agent loop would.

import { bus } from '@/core/bus'
import { useSettings } from '@/stores/settings'
import { runStudioTask, type StudioTaskOptions } from './index'
import { studio } from './state'

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__yuiStudio = async (request: string, overrides: Partial<StudioTaskOptions> = {}) => {
    const settings = useSettings()
    const t0 = performance.now()
    const result = await runStudioTask(request, {
      lang: settings.speechLang,
      model: settings.agentModel,
      permission: settings.permission,
      ...overrides,
    })
    bus.emit('character:react', { emotion: result.ok ? 'happy' : 'sorry', line: result.summary, source: 'agent' })
    return { ...result, ms: Math.round(performance.now() - t0), timeline: studio.timeline.map(e => ({ ...e })) }
  }
  w.__yuiStudioState = studio
}
