// Deterministic rule gate for proactive (screen-only) observer actions.
// Utterance responses never pass through here.
//
// There is no daily limit, long cooldown or dwell requirement: the observer decides when
// something on screen is worth a word. The gate only keeps her from talking over the
// user or herself, and keeps one short gap so she does not chatter on every 3 s check.

/** Minimum time between her last spoken line (of any origin) and a proactive line. */
export const PROACTIVE_GAP_MS = 20_000

export interface GateInput {
  now: number
  /** When she last said a line (proactive or a reply); null if not yet this session. */
  lastLineAt: number | null
  /** The user is speaking (VAD or push-to-talk held). */
  userSpeaking: boolean
  /** Her own TTS line is still playing. */
  ttsPlaying: boolean
  /** The agent is running a task. */
  agentBusy: boolean
}

export type GateReason = 'speaking' | 'talking' | 'busy' | 'gap'
export type GateResult = { allow: true } | { allow: false, reason: GateReason }

export function gateProactive(i: GateInput): GateResult {
  if (i.userSpeaking) return { allow: false, reason: 'speaking' }
  if (i.ttsPlaying) return { allow: false, reason: 'talking' }
  if (i.agentBusy) return { allow: false, reason: 'busy' }
  if (i.lastLineAt !== null && i.now - i.lastLineAt < PROACTIVE_GAP_MS) return { allow: false, reason: 'gap' }
  return { allow: true }
}
