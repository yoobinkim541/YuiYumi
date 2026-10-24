// The two shipped characters. Packs are built by scripts/build-web-model.mjs into
// public/models/<id>.bin (AES-GCM encrypted zip) and <id>-icon.png.

import type { CharacterNode } from '@/core/types'
import type { HeadPatPetting, HeadPatRecovery } from './live2d/head-pat'
import { TT2_CHOREOGRAPHY, YUI_CHOREOGRAPHY, type Choreography } from './choreography'
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
  /** Reaction, touch, idle and speaking motions (choreography.ts). */
  choreography: Choreography
}

export interface TouchDef {
  /**
   * The head for petting and hit testing, in the model's own canvas: the eye center as
   * shares of its width (x) and height (y), the head radius as a share of its width.
   */
  head: { x: number, y: number, radius: number }
  /**
   * Face while a hand is on her head, by how it pets her (just holding or pulling, slow
   * strokes, a fast rub), and after poking: profile emotion labels or expression names.
   */
  pet: Record<HeadPatPetting, string[]>
  /** Face while she comes round after a fast rub is let go: dizzy, then shaking it off. */
  recover: Record<Exclude<HeadPatRecovery, 'none'>, string[]>
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
    touch: {
      head: { x: 0.5, y: 0.222, radius: 0.135 },
      // Held: wide-open eyes with raised brows looking up at the hand (pat-look-up, built
      // into her pack; the runtime aims the eyeballs at the hand). Slow strokes: blush
      // over her own resting smile. Fast rub: the round comic eyes (owner's choice).
      pet: { none: ['pat-look-up'], slow: ['脸红'], fast: ['震惊'] },
      // Dizzy after a fast rub: half-lidded dazed eyes over the open wavy flustered mouth
      // while she circles; the round comic eyes again while she shakes it off. She has no
      // swirl eyes, and squeezed-shut eyes were turned down for her.
      recover: { dizzy: ['无语', '害羞嘴'], shake: ['震惊'] },
      pout: ['playful'],
    },
    choreography: TT2_CHOREOGRAPHY,
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
    framing: { visible: 0.6, topCut: 0.02 },
    touch: {
      head: { x: 0.5, y: 0.163, radius: 0.09 },
      // Held: cat eyes with raised brows looking up at the hand (the runtime aims the
      // eyeballs at it; the slit pupils follow). Slow strokes: >< eyes over her own mouth.
      // Fast rub: the >< eyes plus a blushing smile and a sweat drop.
      pet: { none: ['쓰다듬기-올려다봄'], slow: ['뀨잉'], fast: ['뀨잉', '쓰다듬기-헤헤'] },
      // Dizzy after a fast rub: unblinking swirl eyes, worried brows and a small slack
      // mouth while she circles; >< eyes while she shakes it off.
      recover: { dizzy: ['눈빙글', '쓰다듬기-어질'], shake: ['뀨잉'] },
      pout: ['볼빵빵'],
    },
    choreography: YUI_CHOREOGRAPHY,
  },
}

export const DEFAULT_CHARACTER: CharacterId = 'yui'

export const isCharacterId = (v: unknown): v is CharacterId => v === 'tt2' || v === 'yui'
