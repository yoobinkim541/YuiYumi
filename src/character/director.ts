// Turns bus events into runtime calls. Keeps the latest node, emotion and mouth so a
// runtime attached later (the model loads after the app mounts) starts in sync.

import type { Emotion } from '@shared/contracts'
import { bus } from '@/core/bus'
import type { CharacterNode, CharacterRuntime, MouthPose } from '@/core/types'
import type { EmotionMap } from './emotion-map'

const EMOTION_HOLD_MS = 4000

export class Director {
  private runtime: CharacterRuntime | null = null
  private node: CharacterNode = 'idle'
  private emotion: Emotion = 'neutral'
  private mouth: MouthPose | null = null
  private revertTimer: ReturnType<typeof setTimeout> | null = null
  private offs: (() => void)[] = []
  private emotions: EmotionMap | null = null

  start(): void {
    this.offs.push(
      bus.on('character:node', ({ node }) => this.setNode(node)),
      bus.on('character:react', ({ emotion, line, motion }) => this.react(emotion, line, motion)),
      bus.on('character:mouth', pose => this.setMouth(pose)),
    )
  }

  stop(): void {
    this.offs.forEach(off => off())
    this.offs = []
    if (this.revertTimer) clearTimeout(this.revertTimer)
  }

  /** `emotions` gives the default reaction motion of each emotion for this model. */
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
    const m = motion ?? this.emotions?.[emotion]?.motion
    if (m) this.runtime?.playMotion(m)
    if (line) bus.emit('bubble', { text: line })
    if (this.revertTimer) clearTimeout(this.revertTimer)
    this.revertTimer = null
    if (emotion !== 'neutral') this.scheduleRevert(EMOTION_HOLD_MS)
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
