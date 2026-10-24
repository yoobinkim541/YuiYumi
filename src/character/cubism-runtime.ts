// Live2D runtime: Pixi v6 + pixi-live2d-display (Cubism 4 framework) with the
// cubism-web-batched-renderer draw path. The SDK expression manager, eye blink and
// breath are replaced by the layers in ./live2d, applied once per frame after the
// motion update and before physics (see `frameHook`).

import type { Emotion } from '@shared/contracts'
import type { CharacterNode, CharacterRuntime, MouthPose } from '@/core/types'
import { ensureCubismCore, type CoreKind } from './core'
import { applyAmbient, parseAmbientMotion, type AmbientMotion } from './live2d/ambient'
import type { CoreModel } from './live2d/core-model'
import { composeExpressions, ExpressionLayer, parseExpression } from './live2d/expressions'
import { applyBreath, applyIdleNoise, AutoBlink, LipSync, setMotionLoop } from './live2d/procedural'
import { loadModelPack, type ModelPack } from './live2d/pack'
import { EMPTY_PROFILE, type ModelProfile } from './model-data'
import type { CharacterModelDef } from './models'
import type { AnimGraph, NodeSettings } from './node-map'
import { characterView } from './state'

// Loosely typed handles into pixi-live2d-display; its bundled typings do not expose the
// Cubism 4 internals used here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyModel = any
type PixiApp = any

const FORCE = 3 // MotionPriority.FORCE

export function webgl2Available(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  }
  catch {
    return false
  }
}

export class CubismRuntime implements CharacterRuntime {
  private app: PixiApp = null
  private model: AnyModel = null
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private baseSize = { w: 1, h: 1 }
  private destroyed = false
  private core: CoreKind | null = null

  private profile: ModelProfile | null = null
  private graph: AnimGraph | null = null
  private pack: ModelPack | null = null
  private expressions = new ExpressionLayer()
  private ambient: AmbientMotion[] = []
  private blink = new AutoBlink()
  private lipSync = new LipSync()
  private node: NodeSettings
  private nodeKey: CharacterNode = 'idle'
  private emotion: Emotion = 'neutral'
  private lastStartedGroup: string | null = null
  private groups = new Set<string>()
  /** A reaction motion is playing over the node motion. */
  private reacting = false

  constructor(private readonly def: CharacterModelDef) {
    this.node = def.nodes('idle', null)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.model || !this.node.lookAt || !this.app) return
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    this.model.focus(e.clientX - rect.left, e.clientY - rect.top)
  }

  async mount(container: HTMLElement): Promise<void> {
    if (!webgl2Available()) throw new Error('WebGL2 is not available')
    this.container = container
    // Must precede the first import of pixi-live2d-display/cubism4.
    this.core = await ensureCubismCore()

    const PIXI = await import('pixi.js')
    PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2
    const [{ Live2DModel, Cubism4ModelSettings }, { installCubismBatchedRenderer }, pack] = await Promise.all([
      import('pixi-live2d-display/cubism4'),
      import('cubism-web-batched-renderer'),
      loadModelPack(this.def.pack, this.def.id),
    ])
    this.pack = pack
    if (this.destroyed) { pack.revoke(); return }
    this.profile = (await pack.json<ModelProfile>('profile.json')) ?? EMPTY_PROFILE
    this.graph = await pack.json<AnimGraph>('anim-graph.json')
    this.node = this.def.nodes(this.nodeKey, this.graph)

    const width = container.clientWidth || 520
    const height = container.clientHeight || 780
    this.app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })
    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    container.appendChild(canvas)

    Live2DModel.registerTicker(PIXI.Ticker as any)
    const settings = new Cubism4ModelSettings(pack.model3 as any)
    settings.resolveURL = (path: string) => pack.resolveURL(path)
    const model: AnyModel = await Live2DModel.from(settings, { autoInteract: false })
    if (this.destroyed) { model.destroy(); pack.revoke(); return }
    installCubismBatchedRenderer(model.internalModel)
    this.model = model

    model.scale.set(1)
    this.baseSize = { w: model.width || 1, h: model.height || 1 }
    model.anchor.set(0.5, 0)
    this.app.stage.addChild(model)
    this.fit()

    await this.setupLayers(model, pack)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    window.addEventListener('pointermove', this.onPointerMove)
    characterView.mode = 'live2d'

    this.applyNode()
    this.setEmotion(this.emotion)
  }

  private async setupLayers(model: AnyModel, pack: ModelPack) {
    const internal = model.internalModel
    const mm = internal.motionManager
    this.groups = new Set(Object.keys(mm.definitions ?? {}))

    // Our layers replace the SDK's single-expression manager, eye blink and breath.
    mm.expressionManager = null
    internal.eyeBlink = null
    delete internal.breath

    // Runs after the motion update and saveParameters(), before physics: whatever is
    // written here is reverted by loadParameters() after the frame, so additive layers
    // do not accumulate across frames.
    let elapsed = 0
    internal.updateNaturalMovements = (dtMs: number) => {
      const dt = Math.min(Math.max(dtMs, 0), 100)
      elapsed += dt / 1000
      this.frameHook(internal.coreModel as CoreModel, dt, elapsed)
    }

    mm.on('motionStart', (group: string, index: number) => {
      this.lastStartedGroup = group
      // The idle motion repeats inside the SDK so each cycle does not fade in from rest.
      if (group === mm.groups.idle) setMotionLoop(mm.motionGroups[group]?.[index], true)
    })
    mm.on('motionFinish', () => {
      this.reacting = false
      const loop = this.node.motion?.loop ? this.node.motion.name : null
      // A one-shot reaction ended during a node with its own loop: resume the loop.
      if (loop && this.lastStartedGroup !== loop) queueMicrotask(() => void this.startMotion(loop, true))
    })

    // Expressions and ambient loops come from the pack; failures only drop that piece.
    // Every motion is preloaded so the pack's object URLs can be revoked right away.
    const profile = this.profile ?? EMPTY_PROFILE
    await Promise.all([
      ...pack.expressions.map(async (ref) => {
        try { this.expressions.add(parseExpression(ref.Name, await pack.json(ref.File), profile)) }
        catch (e) { console.warn('[character] expression', ref.Name, e) }
      }),
      ...profile.ambient.map(async (a) => {
        try { this.ambient.push(parseAmbientMotion(await pack.json(a.motion), a.gate)) }
        catch (e) { console.warn('[character] ambient', a.motion, e) }
      }),
      ...[...this.groups].map(async (group) => {
        try { await mm.loadMotion(group, 0) }
        catch (e) { console.warn('[character] motion preload', group, e) }
      }),
    ])
    pack.revoke()
  }

  private frameHook(core: CoreModel, dtMs: number, t: number) {
    this.expressions.apply(core, dtMs / 1000, this.lipSync.active)
    applyAmbient(core, this.ambient, t)
    if (this.node.breath) applyBreath(core, t)
    if (this.node.idleNoise) applyIdleNoise(core, t)
    if (this.node.blink) this.blink.apply(core, dtMs)
    this.lipSync.apply(core, dtMs)
  }

  private fit() {
    if (!this.model || !this.app) return
    const { width, height } = this.app.screen
    const { visible, topCut } = this.def.framing
    // Fill the window height with the upper part of the model; the legs fall below the
    // window edge and are clipped by the window.
    const s = height / (this.baseSize.h * (visible - topCut))
    this.model.scale.set(s)
    this.model.position.set(width / 2, -this.baseSize.h * s * topCut)
  }

  private resize() {
    if (!this.app || !this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w > 0 && h > 0) {
      this.app.renderer.resize(w, h)
      this.fit()
    }
  }

  private async startMotion(name: string, loop: boolean): Promise<void> {
    const mm = this.model?.internalModel.motionManager
    if (!mm || !this.groups.has(name)) {
      if (import.meta.env.DEV) console.debug('[character] unknown motion', name)
      return
    }
    try {
      const motion = await mm.loadMotion(name, 0)
      setMotionLoop(motion, loop)
      await mm.startMotion(name, 0, FORCE)
    }
    catch (e) {
      console.warn('[character] motion failed', name, e)
    }
  }

  private applyNode() {
    if (!this.model) return
    const mm = this.model.internalModel.motionManager
    const m = this.node.motion
    if (m) void this.startMotion(m.name, m.loop)
    else if (this.lastStartedGroup && this.lastStartedGroup !== mm.groups.idle) mm.stopAllMotions()
    if (!this.node.lookAt) this.model.internalModel.focusController.focus(0, 0)
  }

  setNode(node: CharacterNode): void {
    characterView.node = node
    if (node === this.nodeKey && this.model) return
    this.nodeKey = node
    this.node = this.def.nodes(node, this.graph)
    this.reacting = false
    this.applyNode()
  }

  setEmotion(emotion: Emotion): void {
    this.emotion = emotion
    characterView.emotion = emotion
    if (!this.profile) return
    const label = this.def.emotions[emotion]?.label ?? null
    const names = label ? this.profile.emotions[label] ?? [] : []
    this.expressions.setActive(composeExpressions(names, this.profile, this.expressions.names()))
    // The face returned to neutral: end a reaction motion and resume the node motion.
    if (emotion === 'neutral' && this.reacting) {
      this.reacting = false
      this.applyNode()
    }
  }

  playMotion(name: string): void {
    if (!this.groups.has(name)) return
    this.reacting = true
    void this.startMotion(name, false)
  }

  setMouth(pose: MouthPose | null): void {
    this.lipSync.set(pose ? pose.open : null)
    characterView.speaking = pose !== null
  }

  /** Dev inspection: active expression weights and the values of the given parameters. */
  debugState(ids: string[] = []): Record<string, unknown> {
    const core = this.model?.internalModel.coreModel as CoreModel | undefined
    return {
      core: this.core,
      model: this.def.id,
      node: this.nodeKey,
      emotion: this.emotion,
      expressions: this.expressions.snapshot(),
      motion: this.model?.internalModel.motionManager.state.currentGroup ?? null,
      params: Object.fromEntries(ids.map(id => [id, core?.getParameterValueById(id)])),
    }
  }

  destroy(): void {
    this.destroyed = true
    this.pack?.revoke()
    window.removeEventListener('pointermove', this.onPointerMove)
    this.resizeObserver?.disconnect()
    try { this.app?.destroy(true, { children: true, texture: true, baseTexture: true }) }
    catch (e) { console.warn('[character] destroy', e) }
    this.app = null
    this.model = null
  }
}
