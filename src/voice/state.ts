// Reactive voice status shared by the voice modules and the ControlBar.

import { reactive } from 'vue'

export type VoiceStatus = 'idle' | 'listening' | 'recording' | 'transcribing' | 'speaking'

export const voiceState = reactive({
  /** Push-to-talk is held. */
  recording: false,
  /** VAD toggle (off by default; the demo default is push-to-talk). */
  vadEnabled: false,
  /** VAD model is loading. */
  vadLoading: false,
  /** VAD currently hears speech. */
  vadSpeaking: false,
  /** STT requests in flight. */
  transcribing: 0,
  /** TTS audio is playing. */
  speaking: false,
  /** Last user-facing error (mic denied, VAD failed to load, ...). */
  error: null as string | null,
})

export function currentStatus(): VoiceStatus {
  if (voiceState.recording || voiceState.vadSpeaking) return 'recording'
  if (voiceState.transcribing > 0) return 'transcribing'
  if (voiceState.speaking) return 'speaking'
  if (voiceState.vadEnabled) return 'listening'
  return 'idle'
}
