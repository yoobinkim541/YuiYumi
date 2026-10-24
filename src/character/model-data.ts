// profile.json inside each model pack (built from the model's yuiyumi.toml).

export interface ModelProfile {
  model_name: string
  idle_motion: string | null
  ambient: { motion: string, gate?: string }[]
  expressions: Record<string, { kind?: 'emotion' | 'toggle', hides_mouth?: boolean, no_blink?: boolean, fade_in_s?: number, fade_out_s?: number, hold_ms?: number }>
  mutex_groups: Record<string, string[]>
  /** Profile emotion label -> expression names. */
  emotions: Record<string, string[]>
}

export const EMPTY_PROFILE: ModelProfile = {
  model_name: '',
  idle_motion: null,
  ambient: [],
  expressions: {},
  mutex_groups: {},
  emotions: {},
}
