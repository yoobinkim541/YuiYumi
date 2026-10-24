// Character nodes -> motions and procedural layers.
//
// TT2.0 model: no animation graph, so the mapping lives here (NODE_MAP_TT2). All TT2.0
// motions are 8-15 s loops. State nodes loop their motion until the next node; event
// nodes (attention, praised, failed) play theirs once, then the idle motion resumes.
// `motion: null` keeps the idle motion (model3 `Idle` group).
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
  idle: { ...base, lookAt: true, motion: null },
  listening: { ...base, motion: { name: '2-0-tt2-0-simleidle', loop: true } },
  working: { ...base, motion: { name: '2-0-tt2-0-questionmotion', loop: true } },
  waiting: { ...base, motion: { name: '2-0-tt2-0-poutidle', loop: true } },
  // Same body motion as idle; null avoids restarting it when speech starts.
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
    lookAt: proc('look_at') || def.gaze?.type === 'cursor',
    idleNoise: proc('idle_noise'),
    motion: motion ? { name: motion.name, loop: motion.looping } : null,
  }
}
