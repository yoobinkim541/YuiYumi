import type { AssistantMode } from '@/stores/settings'

/** Wake rule: any non-empty transcript in quiet/ornamental mode switches to active. */
export function modeAfterTranscript(mode: AssistantMode, text: string): AssistantMode {
  return text.trim().length > 0 ? 'active' : mode
}

/** Indicator click: active <-> quiet (ornamental also resumes to active). */
export function toggledMode(mode: AssistantMode): AssistantMode {
  return mode === 'active' ? 'quiet' : 'active'
}

export function isObserving(mode: AssistantMode): boolean {
  return mode === 'active'
}
