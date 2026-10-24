// Live2D runtime: Pixi v6 + pixi-live2d-display (Cubism 4 framework) with the
// cubism-web-batched-renderer draw path. The SDK expression manager, eye blink and
// breath are replaced by the layers in ./live2d, applied once per frame after the
// motion update and before physics (see `frameHook`).

import type { Emotion } from '@shared/contracts'
import { bus } from '@/core/bus'
import type { CharacterNode, CharacterRuntime, MouthPose } from '@/core/types'
import { ensureCubismCore, type CoreKind } from './core'
import { applyAmbient, parseAmbientMotion, type AmbientMotion } from './live2d/ambient'
import type { CoreModel } from './live2d/core-model'
import { composeExpressions, ExpressionLayer, parseExpression } from './live2d/expressions'
import { createHeadPat, headPatZoneContains, softAdd, type HeadPatHead, type HeadPatPetting, type HeadPatPose } from './live2d/head-pat'
import { pointInTriangle, TouchGestures, type TouchReaction, type TouchRegion } from './live2d/touch'
import { applyBreath, applyIdleNoise, AutoBlink, Glance, glanceDirection, LipSync, setMotionLoop } from './live2d/procedural'
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
/** Drawables fainter than this do not count as her body for hit testing. */
const HIT_MIN_OPACITY = 0.2
/** How long the pout face stays after poking. */
const POUT_MS = 2600
/** Taps emit a bus reaction at most this often, so a flurry does not restart motions. */
const TAP_REACT_COOLDOWN_MS = 2500

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
  /** Dev-only parameter overrides, applied every frame. */
  readonly devParams = new Map<string, number>()
  private destroyed = false
  private core: CoreKind | null = null

  private profile: ModelProfile | null = null
  private graph: AnimGraph | null = null
  private pack: ModelPack | null = null
  private expressions = new ExpressionLayer()
  private ambient: AmbientMotion[] = []
  private blink = new AutoBlink()
  private lipSync = new LipSync()
  /** Event-driven glance toward screen activity (character:look); never cursor following. */
  private glance = new Glance()
  private lastGlance: ReturnType<Glance['step']> = null
  private node: NodeSettings
  private nodeKey: CharacterNode = 'idle'
  private emotion: Emotion = 'neutral'
  private lastStartedGroup: string | null = null
  private groups = new Set<string>()
  /** A reaction motion is playing over the node motion. */
  private reacting = false

  // Touch: a held head follows the hand (head-pat springs), petting and pokes change the face.
  private PIXI: any = null
  private headPat = createHeadPat({ onChange: s => this.onHeadPatChange(s.holding, s.petting) })
  private gestures = new TouchGestures()
  private touchPointer: number | null = null
  private touchFace: string[] = []
  private touchFaceTimer: ReturnType<typeof setTimeout> | null = null
  private lastTapReactAt = -Infinity
  private lastPat: HeadPatPose | null = null
  /** Parameter ranges for easing the head-pat pose into the angle limits; null when absent. */
  private paramRanges = new Map<string, readonly [number, number] | null>()

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
    this.PIXI = PIXI
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
    canvas.style.touchAction = 'none'
    container.appendChild(canvas)
    canvas.addEventListener('pointerdown', this.onTouchDown)
    canvas.addEventListener('pointermove', this.onTouchMove)
    canvas.addEventListener('pointerup', this.onTouchUp)
    canvas.addEventListener('pointercancel', this.onTouchCancel)
    canvas.addEventListener('lostpointercapture', this.onTouchCancel)
    window.addEventListener('blur', this.onTouchCancel)

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
    // No blinking while an expression holds the eyes shut (e.g. a squeezed-eye face).
    if (this.node.blink && this.expressions.eyeHold() === 0) this.blink.apply(core, dtMs)
    this.lipSync.apply(core, dtMs)
    // A glance toward screen activity, on top of the motion; held while she talks.
    const g = this.glance.step(dtMs, this.lipSync.active)
    this.lastGlance = g
    if (g) {
      this.addEased(core, 'ParamEyeBallX', g.eyeX)
      this.addEased(core, 'ParamEyeBallY', g.eyeY)
      this.addEased(core, 'ParamAngleX', g.angleX)
      this.addEased(core, 'ParamAngleY', g.angleY)
      this.addEased(core, 'ParamBodyAngleX', g.bodyX)
    }
    // Dev-only parameter overrides (window.__yui.param) for trying out faces.
    for (const [id, v] of this.devParams) core.setParameterValueById(id, v)
    // A hand on her head pulls it, and her body after it, on top of everything else;
    // physics runs after this hook, so hair and clothes swing with it.
    // Each offset eases into the parameter's limit instead of being clamped at it.
    const pat = this.headPat.step(dtMs / 1000)
    this.lastPat = pat
    if (pat) {
      this.addEased(core, 'ParamAngleX', pat.x)
      this.addEased(core, 'ParamAngleY', pat.y)
      this.addEased(core, 'ParamAngleZ', pat.z)
      this.addEased(core, 'ParamBodyAngleX', pat.bodyX)
      this.addEased(core, 'ParamBodyAngleZ', pat.bodyZ)
    }
  }

  /** Adds `offset` to a parameter, slowing down into its range limit (see softAdd). */
  private addEased(core: CoreModel, id: string, offset: number) {
    if (!this.paramRanges.has(id)) {
      const index = core.getParameterIndex(id)
      this.paramRanges.set(id, index >= 0 && index < core.getParameterCount()
        ? [core.getParameterMinimumValue(index), core.getParameterMaximumValue(index)] as const
        : null)
    }
    const range = this.paramRanges.get(id)
    if (!range) return
    core.setParameterValueById(id, softAdd(core.getParameterValueById(id), offset, range[0], range[1]))
  }

  // ---- glance ------------------------------------------------------------------------

  /**
   * Looks toward a client point for `holdMs` (longer while she talks), then back ahead.
   * The direction is taken from her head; distances count in desktop pixels (the stage
   * is laid out in desktop pixels, so the canvas scale is the desktop scale).
   */
  lookAt(clientX: number, clientY: number, holdMs: number): void {
    const c = this.canvasRect()
    const head = this.headClient()
    if (!c || !head) return
    const dir = glanceDirection((clientX - head.x) / c.k, (clientY - head.y) / c.k)
    this.glance.look(dir.x, dir.y, holdMs)
  }

  // ---- touch -------------------------------------------------------------------------

  /** Client pixels per stage pixel, and the canvas rect. */
  private canvasRect(): { rect: DOMRect, k: number } | null {
    if (!this.app) return null
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    if (!(rect.width > 0)) return null
    return { rect, k: rect.width / this.app.screen.width }
  }

  /** Her head in client coordinates, from the model's touch definition. */
  private headClient(): HeadPatHead | null {
    const c = this.canvasRect()
    if (!this.model || !this.PIXI || !c) return null
    const im = this.model.internalModel
    const { x, y, radius } = this.def.touch.head
    const toClient = (mx: number, my: number) => {
      const local = im.localTransform.apply(new this.PIXI.Point(mx, my))
      const g = this.model.transform.worldTransform.apply(local)
      return { x: c.rect.left + g.x * c.k, y: c.rect.top + g.y * c.k }
    }
    const eye = toClient(x * im.originalWidth, y * im.originalHeight)
    const edge = toClient((x + radius) * im.originalWidth, y * im.originalHeight)
    return { x: eye.x, y: eye.y, radius: Math.hypot(edge.x - eye.x, edge.y - eye.y) }
  }

  /** Whether the client point lies on a visible drawable mesh of the model. */
  private onBody(clientX: number, clientY: number): boolean {
    const c = this.canvasRect()
    if (!this.model || !this.PIXI || !c) return false
    const p = this.model.toModelPosition(new this.PIXI.Point((clientX - c.rect.left) / c.k, (clientY - c.rect.top) / c.k))
    const im = this.model.internalModel
    const core = im.coreModel
    const n: number = core.getDrawableCount()
    for (let i = 0; i < n; i++) {
      if (!core.getDrawableDynamicFlagIsVisible(i) || core.getDrawableOpacity(i) < HIT_MIN_OPACITY) continue
      const v: Float32Array = im.getDrawableVertices(i)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let j = 0; j < v.length; j += 2) {
        if (v[j] < minX) minX = v[j]
        if (v[j] > maxX) maxX = v[j]
        if (v[j + 1] < minY) minY = v[j + 1]
        if (v[j + 1] > maxY) maxY = v[j + 1]
      }
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue
      const idx: Uint16Array = core.getDrawableVertexIndices(i)
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t] * 2, b = idx[t + 1] * 2, d = idx[t + 2] * 2
        if (pointInTriangle(p.x, p.y, v[a], v[a + 1], v[b], v[b + 1], v[d], v[d + 1])) return true
      }
    }
    return false
  }

  /** 'head' over the pettable head zone, 'body' over any other visible part, else null. */
  hitTest(clientX: number, clientY: number): TouchRegion | null {
    if (!this.model) return null
    const head = this.headClient()
    const pt = { x: clientX, y: clientY }
    if (head && headPatZoneContains(head, pt) && (this.onBody(clientX, clientY) || this.inHeadCore(head, pt))) return 'head'
    return this.onBody(clientX, clientY) ? 'body' : null
  }

  /** The inner part of the head zone counts even over gaps between meshes (hair strands). */
  private inHeadCore(head: HeadPatHead, pt: { x: number, y: number }): boolean {
    return Math.hypot(pt.x - head.x, pt.y - (head.y - head.radius * 0.5)) <= head.radius * 0.9
  }

  private onTouchDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.touchPointer !== null) return
    const region = this.hitTest(e.clientX, e.clientY)
    // Off the avatar the event bubbles on, so the window drag starts as before.
    if (!region) return
    e.stopPropagation()
    e.preventDefault()
    this.touchPointer = e.pointerId
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture?.(e.pointerId)
    if (region === 'head') el.style.cursor = 'grabbing'
    this.gestures.down(region, e.clientX, e.clientY, e.timeStamp)
    const head = region === 'head' ? this.headClient() : null
    if (head) this.headPat.press({ x: e.clientX, y: e.clientY }, head, e.timeStamp)
  }

  private hoverAt = 0
  private onTouchMove = (e: PointerEvent) => {
    if (this.touchPointer === null) {
      // Hover cursor only (she does not look at the cursor): checked at most every 60 ms.
      if (e.timeStamp - this.hoverAt < 60) return
      this.hoverAt = e.timeStamp
      const region = this.hitTest(e.clientX, e.clientY)
      ;(e.currentTarget as HTMLElement).style.cursor = region === 'head' ? 'grab' : region === 'body' ? 'pointer' : ''
      return
    }
    if (e.pointerId !== this.touchPointer) return
    e.stopPropagation()
    for (const sample of e.getCoalescedEvents?.() ?? [e]) {
      this.gestures.move(sample.clientX, sample.clientY)
      this.headPat.move({ x: sample.clientX, y: sample.clientY }, sample.timeStamp)
    }
  }

  private onTouchUp = (e: PointerEvent) => {
    if (e.pointerId !== this.touchPointer) return
    e.stopPropagation()
    this.touchPointer = null
    const reaction = this.gestures.up(e.timeStamp)
    this.headPat.release()
    if (reaction) this.react(reaction)
  }

  private onTouchCancel = () => {
    if (this.touchPointer === null) return
    this.touchPointer = null
    this.gestures.cancel()
    this.headPat.release()
  }

  /** A hand grabbed or let go of her head, or changed how fast it pets her: her face follows. */
  private onHeadPatChange(holding: boolean, petting: HeadPatPetting) {
    this.gestures.petting(petting !== 'none', performance.now())
    this.setTouchFace(holding ? this.def.touch.pet[petting] : [])
    bus.emit('character:touch', { kind: 'pet', holding, petting })
  }

  /** Wears `faces` (labels or expression names) over the emotion, for `ms` or until replaced. */
  private setTouchFace(faces: readonly string[], ms?: number) {
    if (this.touchFaceTimer) clearTimeout(this.touchFaceTimer)
    this.touchFaceTimer = null
    const profile = this.profile ?? EMPTY_PROFILE
    this.touchFace = faces.flatMap(f => profile.emotions[f] ?? [f])
    if (ms !== undefined) {
      this.touchFaceTimer = setTimeout(() => {
        this.touchFaceTimer = null
        this.touchFace = []
        this.refreshExpressions()
      }, ms)
    }
    this.refreshExpressions()
  }

  private react(r: TouchReaction) {
    const now = performance.now()
    if (r.kind === 'pet') {
      // Pleased after being petted; the emotion's motion sways her after the springs settle.
      bus.emit('character:react', { emotion: 'happy', source: 'fallback' })
      return
    }
    if (r.kind === 'pout') {
      // A mild pout on a calm base: the neutral react drops a tap's surprised face.
      this.headPat.nudge({ x: 140, bodyX: -40 })
      bus.emit('character:react', { emotion: 'neutral', source: 'fallback' })
      this.setTouchFace(this.def.touch.pout, POUT_MS)
      bus.emit('character:touch', { kind: 'poke' })
      return
    }
    if (r.region === 'head') this.headPat.nudge({ y: -160, z: 40 })
    else this.headPat.nudge({ z: 90, bodyX: 60, bodyZ: 70 })
    if (now - this.lastTapReactAt < TAP_REACT_COOLDOWN_MS || this.touchFace.length) return
    this.lastTapReactAt = now
    bus.emit('character:react', { emotion: r.region === 'head' ? 'happy' : 'surprised', source: 'fallback' })
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
    // World transforms refresh on the next render.
    requestAnimationFrame(() => this.updateHeadTop())
  }

  /** Publishes the top of the head (stage px = CSS px of the layer) for the speech bubble. */
  private updateHeadTop() {
    if (!this.model || !this.PIXI) return
    const im = this.model.internalModel
    const { x, y, radius } = this.def.touch.head
    const toStage = (mx: number, my: number) => this.model.transform.worldTransform.apply(im.localTransform.apply(new this.PIXI.Point(mx, my)))
    const eye = toStage(x * im.originalWidth, y * im.originalHeight)
    const edge = toStage((x + radius) * im.originalWidth, y * im.originalHeight)
    const top = Math.round(eye.y - Math.hypot(edge.x - eye.x, edge.y - eye.y) * 1.05)
    characterView.headTop = Math.max(0, top)
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

  private refreshExpressions() {
    if (!this.profile) return
    const profile = this.profile
    // Each face is a profile emotion label or, failing that, an expression name.
    const names = (this.def.emotions[this.emotion]?.faces ?? []).flatMap(f => profile.emotions[f] ?? [f])
    // The touch face is the last layer, so it wins any mutex group.
    this.expressions.setActive(composeExpressions([...names, ...this.touchFace], this.profile, this.expressions.names()))
  }

  setEmotion(emotion: Emotion): void {
    this.emotion = emotion
    characterView.emotion = emotion
    if (!this.profile) return
    this.refreshExpressions()
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
      touch: { head: this.headClient(), holding: this.headPat.state.holding, petting: this.headPat.state.petting, face: this.touchFace, pose: this.lastPat },
      glance: this.lastGlance,
      motion: this.model?.internalModel.motionManager.state.currentGroup ?? null,
      params: Object.fromEntries(ids.map(id => [id, core?.getParameterValueById(id)])),
    }
  }

  destroy(): void {
    this.destroyed = true
    this.pack?.revoke()
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('blur', this.onTouchCancel)
    if (this.touchFaceTimer) clearTimeout(this.touchFaceTimer)
    this.resizeObserver?.disconnect()
    try { this.app?.destroy(true, { children: true, texture: true, baseTexture: true }) }
    catch (e) { console.warn('[character] destroy', e) }
    this.app = null
    this.model = null
  }
}
