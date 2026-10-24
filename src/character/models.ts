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
}

const base = `${import.meta.env.BASE_URL}models/`

export const CHARACTER_MODELS: Record<CharacterId, CharacterModelDef> = {
  tt2: {
    id: 'tt2',
    label: 'TT2.0',
    pack: `${base}tt2.bin`,
    icon: `${base}tt2-icon.png`,
    emotions: TT2_EMOTIONS,
    nodes: node => NODE_MAP_TT2[node] ?? NODE_MAP_TT2.idle,
  },
  yui: {
    id: 'yui',
    label: 'Yui',
    pack: `${base}yui.bin`,
    icon: `${base}yui-icon.png`,
    emotions: YUI_EMOTIONS,
    nodes: (node, graph) => graph
      ? graphNodeSettings(graph, node)
      : { blink: true, breath: true, lookAt: node === 'idle', idleNoise: false, motion: null },
  },
}

export const DEFAULT_CHARACTER: CharacterId = 'tt2'

export const isCharacterId = (v: unknown): v is CharacterId => v === 'tt2' || v === 'yui'
