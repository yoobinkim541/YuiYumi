// Track A: Live2D character. initCharacter() wires the director to the bus; the runtime
// itself is created by CharacterLayer.vue when it mounts (mountCharacter), and recreated
// when the character choice (store.ts) changes.

import type { Emotion } from '@shared/contracts'
import { bus } from '@/core/bus'
import type { CharacterNode, CharacterRuntime } from '@/core/types'
import { CubismRuntime } from './cubism-runtime'
import { director } from './director'
import { FallbackRuntime } from './fallback-runtime'
import { CHARACTER_MODELS, type CharacterId } from './models'

export { useCharacterStore } from './store'
export type { CharacterId } from './models'

let started = false
let current: CharacterRuntime | null = null

export function initCharacter(): void {
  if (started) return
  started = true
  director.start()

  if (import.meta.env.DEV) {
    ;(window as unknown as { __yui: unknown }).__yui = {
      react: (emotion: Emotion = 'happy', line?: string, motion?: string) =>
        bus.emit('character:react', { emotion, line, motion, source: 'fallback' }),
      node: (node: CharacterNode) => bus.emit('character:node', { node }),
      mouth: (open: number | null) => bus.emit('character:mouth', open === null ? null : { open }),
      bubble: (text: string, ttlMs?: number) => bus.emit('bubble', { text, ttlMs }),
      debug: (ids?: string[]) => (current as { debugState?: (ids?: string[]) => unknown } | null)?.debugState?.(ids),
    }
  }
}

/** Mounts the Live2D runtime into `container`, or the 2D fallback if that fails. Never throws. */
export async function mountCharacter(container: HTMLElement, id: CharacterId): Promise<CharacterRuntime> {
  initCharacter()
  const def = CHARACTER_MODELS[id]
  const live2d = new CubismRuntime(def)
  try {
    await live2d.mount(container)
    director.attach(live2d, def.emotions)
    current = live2d
    return live2d
  }
  catch (e) {
    console.warn('[character] Live2D unavailable, using 2D fallback:', e)
    live2d.destroy()
    container.replaceChildren()
    const fallback = new FallbackRuntime()
    await fallback.mount()
    director.attach(fallback)
    current = fallback
    return fallback
  }
}

export function unmountCharacter(runtime: CharacterRuntime): void {
  director.detach(runtime)
  if (current === runtime) current = null
  runtime.destroy()
}
