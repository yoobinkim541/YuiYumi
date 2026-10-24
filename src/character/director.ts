// Turns bus events into runtime calls. Keeps the latest node, emotion and mouth so a
// runtime attached later (the model loads after the app mounts) starts in sync.

import type { Emotion } from '@shared/contracts'
import { bus } from '@/core/bus'
import type { CharacterNode, CharacterRuntime, MouthPose } from '@/core/types'
import { DESKTOP_H, DESKTOP_W } from '@/desktop/windows'
import { MotionPicker } from './choreography'
import type { EmotionMap } from './emotion-map'

const EMOTION_HOLD_MS = 4000
const LOOK_HOLD_MS = 4000

/** Runtimes that can glance at a client point (the Live2D one; the 2D fallback cannot). */
type Glancer = { lookAt?: (clientX: number, clientY: number, holdMs: number) => void }

/** Desktop (logical 1920x1080) point -> client point through the scaled capture root. */
function desktopToClient(x: number, y: number): { x: number, y: number } | null {
  const r = document.querySelector<HTMLElement>('[data-capture-root]')?.getBoundingClientRect()
  if (!r || !(r.width > 0)) return null
  return { x: r.left + x * r.width / DESKTOP_W, y: r.top + y * r.height / DESKTOP_H }
}

export class Director {
  private runtime: CharacterRuntime | null = null
  private node: CharacterNode = 'idle'
  private emotion: Emotion = 'neutral'
  private mouth: MouthPose | null = null
  private revertTimer: ReturnType<typeof setTimeout> | null = null
  private offs: (() => void)[] = []
  private emotions: EmotionMap | null = null
  private picker = new MotionPicker()

  start(): void {
    this.offs.push(
      bus.on('character:node', ({ node }) => this.setNode(node)),
      bus.on('character:react', ({ emotion, line, motion }) => this.react(emotion, line, motion)),
      bus.on('character:mouth', pose => this.setMouth(pose)),
      bus.on('character:look', ({ x, y, holdMs }) => this.look(x, y, holdMs)),
    )
  }

  stop(): void {
    this.offs.forEach(off => off())
    this.offs = []
    if (this.revertTimer) clearTimeout(this.revertTimer)
  }

  /** `emotions` gives the faces and reaction motions of each emotion for this model. */
  attach(runtime: CharacterRuntime, emotions: EmotionMap | null = null): void {
    this.runtime = runtime
    this.emotions = emotions
    runtime.setNode(this.node)
    runtime.setEmotion(this.emotion)
    runtime.setMouth(this.mouth)
  }

  detach(runtime: CharacterRuntime): void {
    if (this.runtime === runtime) this.runtime = null
  }

  setNode(node: CharacterNode): void {
    this.node = node
    this.runtime?.setNode(node)
  }

  react(emotion: Emotion, line?: string, motion?: string): void {
    this.setEmotion(emotion)
    const m = motion ?? this.picker.pick(emotion, this.emotions?.[emotion]?.motions ?? [])
    if (m) this.runtime?.playMotion(m)
    if (line) bus.emit('bubble', { text: line })
    if (this.revertTimer) clearTimeout(this.revertTimer)
    this.revertTimer = null
    if (emotion !== 'neutral') this.scheduleRevert(EMOTION_HOLD_MS)
  }

  /** Glances toward a desktop point (screen activity), then back at the user. */
  look(x: number, y: number, holdMs = LOOK_HOLD_MS): void {
    const p = desktopToClient(x, y)
    if (p) (this.runtime as Glancer | null)?.lookAt?.(p.x, p.y, holdMs)
  }

  private scheduleRevert(ms: number) {
    this.revertTimer = setTimeout(() => {
      // Hold the face while she is still talking.
      if (this.mouth !== null) return this.scheduleRevert(1000)
      this.revertTimer = null
      this.setEmotion('neutral')
    }, ms)
  }

  private setEmotion(emotion: Emotion) {
    this.emotion = emotion
    this.runtime?.setEmotion(emotion)
  }

  private setMouth(pose: MouthPose | null) {
    this.mouth = pose
    this.runtime?.setMouth(pose)
  }
}

export const director = new Director()
