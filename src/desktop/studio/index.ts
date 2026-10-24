// Virtual coding studio for the web demo: builds small apps inside the virtual PC (code
// editor + browser preview) when the real agent runtime of the desktop app is not there.

import type { AgentModel, PermissionLevel } from '@shared/contracts'
import type { Lang } from '@shared/languages'

export interface StudioTaskOptions {
  lang: Lang
  model: AgentModel
  permission: PermissionLevel
  signal?: AbortSignal
}

export interface StudioTaskResult {
  ok: boolean
  /** One or two sentences for the agent loop to report back (user's language). */
  summary: string
}

/** Runs a coding/computer task on the virtual PC. Placeholder until the studio lands. */
export async function runStudioTask(_request: string, _opts: StudioTaskOptions): Promise<StudioTaskResult> {
  return { ok: false, summary: 'studio_unavailable' }
}
