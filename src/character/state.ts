// View state shared between the runtimes and CharacterLayer.vue.

import { reactive } from 'vue'
import type { Emotion } from '@shared/contracts'
import type { CharacterNode } from '@/core/types'

export const characterView = reactive({
  mode: 'loading' as 'loading' | 'live2d' | 'fallback',
  emotion: 'neutral' as Emotion,
  node: 'idle' as CharacterNode,
  /** Bumped on each react so the fallback sprite restarts its animation. */
  pulse: 0,
  speaking: false,
})
