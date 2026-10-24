// The two shipped characters. Packs are built by scripts/build-web-model.mjs into
// public/models/<id>.bin (AES-GCM encrypted zip) and <id>-icon.png.

import type { CharacterNode } from '@/core/types'
import { TT2_EMOTIONS, YUI_EMOTIONS, type EmotionMap } from './emotion-map'
import { graphNodeSettings, NODE_MAP_TT2, type AnimGraph, type NodeSettings } from './node-map'

export type CharacterId = 'tt2' | 'yui'

export interface CharacterModelDef {
  id: CharacterId
  label: string
  /** Encrypted pack URL. */
  pack: string
  /** Plaintext icon for the 2D fallback. */
  icon: string
  emotions: EmotionMap
  /** Node settings; `graph` is the pack's anim-graph.json when the model has one. */
  nodes: (node: CharacterNode, graph: AnimGraph | null) => NodeSettings
  /**
   * Upper-body framing inside the character window. `visible`: fraction of the model's
   * height (from the top of its bounds) that fills the window; the rest (legs) is cut.
   * `topCut`: fraction of the model's height above the head that is empty and skipped.
   */
  framing: { visible: number, topCut: number }
  /** Touch interactions (see cubism-runtime.ts). */
  touch: TouchDef
}

export interface TouchDef {
  /**
   * The head for petting and hit testing, in the model's own canvas: the eye center as
   * shares of its width (x) and height (y), the head radius as a share of its width.
   */
  head: { x: number, y: number, radius: number }
  /** Face while petted and after poking: profile emotion labels or expression names. */
  pet: string[]
  pout: string[]
}

const base = `${import.meta.env.BASE_URL}models/`

export const CHARACTER_MODELS: Record<CharacterId, CharacterModelDef> = {
  tt2: {
    id: 'tt2',
    label: 'Yumi',
    pack: `${base}tt2.bin`,
    icon: `${base}tt2-icon.png`,
    emotions: TT2_EMOTIONS,
    nodes: node => NODE_MAP_TT2[node] ?? NODE_MAP_TT2.idle,
    framing: { visible: 0.5, topCut: 0.02 },
    touch: { head: { x: 0.5, y: 0.222, radius: 0.135 }, pet: ['震惊'], pout: ['playful'] },
  },
  yui: {
    id: 'yui',
    label: 'Yui',
    pack: `${base}yui.bin`,
    icon: `${base}yui-icon.png`,
    emotions: YUI_EMOTIONS,
    nodes: (node, graph) => graph
      ? graphNodeSettings(graph, node)
      : { blink: true, breath: true, lookAt: false, idleNoise: false, motion: null },
    framing: { visible: 0.5, topCut: 0.02 },
    touch: { head: { x: 0.5, y: 0.163, radius: 0.09 }, pet: ['shy'], pout: ['볼빵빵'] },
  },
}

export const DEFAULT_CHARACTER: CharacterId = 'tt2'

export const isCharacterId = (v: unknown): v is CharacterId => v === 'tt2' || v === 'yui'
