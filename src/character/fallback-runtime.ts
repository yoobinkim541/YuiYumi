// 2D fallback when WebGL2, Cubism Core or the model is unavailable: the model icon as a
// sprite, animated with CSS per emotion (CharacterLayer.vue renders it).

import type { Emotion } from '@shared/contracts'
import type { CharacterNode, CharacterRuntime, MouthPose } from '@/core/types'
import { characterView } from './state'

export class FallbackRuntime implements CharacterRuntime {
  async mount(): Promise<void> {
    characterView.mode = 'fallback'
  }

  setEmotion(emotion: Emotion): void {
    characterView.emotion = emotion
    characterView.pulse++
  }

  playMotion(): void {}

  setNode(node: CharacterNode): void {
    characterView.node = node
  }

  setMouth(pose: MouthPose | null): void {
    characterView.speaking = pose !== null && pose.open > 0.05
  }

  destroy(): void {}
}
