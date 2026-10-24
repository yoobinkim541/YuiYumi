// Character nodes -> motions and procedural layers.
//
// TT2.0 model: no animation graph, so the mapping lives here (NODE_MAP_TT2). All TT2.0
// motions are 8-15 s loops. State nodes loop their motion until the next node; event
// nodes (attention, praised, failed) play theirs once, then the body returns to rest.
// `motion: null` plays no body motion (TT2.0 has no idle motion; blink, breath and gaze only).
//
// Yui model: settings come from the model's anim-graph.json node animations.

import type { CharacterNode } from '@/core/types'

export interface NodeSettings {
  blink: boolean
  breath: boolean
  /** Eyes and head follow the cursor. */
  lookAt: boolean
  /** Slow procedural head sway on top of the motion. */
  idleNoise: boolean
  motion: { name: string, loop: boolean } | null
}

const base = { blink: true, breath: true, lookAt: false, idleNoise: false } as const

export const NODE_MAP_TT2: Record<CharacterNode, NodeSettings> = {
  idle: { ...base, motion: null },
  listening: { ...base, motion: { name: '2-0-tt2-0-simleidle', loop: true } },
  working: { ...base, motion: { name: '2-0-tt2-0-questionmotion', loop: true } },
  waiting: { ...base, motion: { name: '2-0-tt2-0-poutidle', loop: true } },
  speaking: { ...base, motion: null },
  attention: { ...base, motion: { name: '2-0-tt2-0-excitingidle', loop: false } },
  praised: { ...base, motion: { name: '2-0-tt2-0-shyidle', loop: false } },
  failed: { ...base, motion: { name: '2-0-tt2-0-sadmotion', loop: false } },
  sleeping: { ...base, motion: { name: '2-0-tt2-0-sleepy1', loop: true } },
}

export type NodeAnimation =
  | { type: 'procedural', module: string, enabled: boolean }
  | { type: 'motion', name: string, slot: string, looping: boolean }

export interface AnimGraph {
  entry: string
  nodes: { key: string, animations: NodeAnimation[], gaze?: { type: string } }[]
}

export function graphNodeSettings(graph: AnimGraph, node: CharacterNode): NodeSettings {
  const def = graph.nodes.find(n => n.key === node)
  if (!def) return { ...base, motion: null }
  const anims = def.animations ?? []
  const proc = (module: string) => anims.some(a => a.type === 'procedural' && a.module === module && a.enabled)
  const motion = anims.find((a): a is Extract<NodeAnimation, { type: 'motion' }> => a.type === 'motion')
  return {
    blink: proc('blink'),
    breath: proc('breath'),
    // Cursor gaze is disabled in the web app: the character faces forward.
    lookAt: false,
    idleNoise: proc('idle_noise'),
    motion: motion ? { name: motion.name, loop: motion.looping } : null,
  }
}
