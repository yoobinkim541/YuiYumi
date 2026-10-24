// Client-side module boundaries. Each track implements one side of these.

import type { Emotion } from '@shared/contracts'

// --- Host: where the screen and activity come from (virtual desktop today, Tauri later)

export interface Frame {
  jpegBase64: string
  width: number
  height: number
  /** Cheap perceptual hash for dwell detection. */
  hash: string
}

export interface ActivitySnapshot {
  activeApp: string | null
  windowTitle: string | null
  /** True while the user is typing inside the screen (last keystroke < 1.5 s ago). */
  typing: boolean
}

export interface ScreenSource {
  capture(): Promise<Frame>
  activity(): ActivitySnapshot
}

// --- Character

export type CharacterNode =
  | 'sleeping' | 'idle' | 'listening' | 'working' | 'waiting'
  | 'speaking' | 'attention' | 'praised' | 'failed'

export interface MouthPose {
  /** 0..1 */
  open: number
}

export interface CharacterRuntime {
  mount(container: HTMLElement): Promise<void>
  setEmotion(emotion: Emotion): void
  playMotion(name: string): void
  setNode(node: CharacterNode): void
  setMouth(pose: MouthPose | null): void
  destroy(): void
}
