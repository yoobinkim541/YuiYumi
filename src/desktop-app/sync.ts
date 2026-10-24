// State sharing between the overlay window and the settings/dashboard panel windows. Each
// window is its own JS realm, so Pinia stores are mirrored over Tauri events (the last write
// wins) and the overlay, which runs voice, nunchi and the agent, broadcasts its runtime status
// (including the agent runtime session the agent panel window follows).

import type { StoreGeneric } from 'pinia'
import { ref, watch } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DialogueTurn } from '@shared/contracts'

const EV_STORE = 'yy://store'
const EV_RUNTIME = 'yy://runtime'
const EV_HELLO = 'yy://hello'
const EV_COMMAND = 'yy://command'
const RUNTIME_INTERVAL_MS = 1500

/** Requests a panel sends to the overlay. agentAsk: a request typed into the agent panel. */
export interface Command { vad?: boolean, agentAsk?: string }

export interface Runtime {
  voice: Record<string, unknown>
  nunchi: Record<string, unknown>
  activity: Record<string, unknown>
  dialogue: DialogueTurn[]
  /** Agent runtime session the overlay's controller follows (the agent panel attaches to it). */
  agentSession?: string | null
}

/** Recent dialogue as last broadcast by the overlay (panel windows). */
export const mirroredDialogue = ref<DialogueTurn[]>([])

export async function sendCommand(c: Command): Promise<void> {
  await emit(EV_COMMAND, c)
}

export function onCommand(fn: (c: Command) => void): void {
  void listen<Command>(EV_COMMAND, ({ payload }) => fn(payload))
}

/** Mirrors the stores' state to and from the other windows. Returns a function that re-sends all. */
export function syncStores(stores: StoreGeneric[]): () => void {
  const self = getCurrentWindow().label
  const last = new Map<string, string>()
  const send = (s: StoreGeneric, json: string) => void emit(EV_STORE, { from: self, id: s.$id, json })
  for (const s of stores) {
    last.set(s.$id, JSON.stringify(s.$state))
    s.$subscribe((_m, state) => {
      const json = JSON.stringify(state)
      if (json === last.get(s.$id)) return
      last.set(s.$id, json)
      send(s, json)
    }, { detached: true, deep: true })
  }
  void listen<{ from: string, id: string, json: string }>(EV_STORE, ({ payload }) => {
    if (payload.from === self) return
    const s = stores.find(x => x.$id === payload.id)
    if (!s || payload.json === last.get(s.$id)) return
    last.set(s.$id, payload.json)
    const next = JSON.parse(payload.json) as Record<string, unknown>
    s.$patch((state: Record<string, unknown>) => { Object.assign(state, next) })
  })
  return () => { for (const s of stores) send(s, JSON.stringify(s.$state)) }
}

/** Overlay: broadcasts the runtime status on change, periodically, and when a panel says hello. */
export function broadcastRuntime(snapshot: () => Runtime, onHello: () => void): void {
  let lastJson = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const send = (force = false) => {
    timer = null
    const json = JSON.stringify(snapshot())
    if (!force && json === lastJson) return
    lastJson = json
    void emit(EV_RUNTIME, JSON.parse(json) as Runtime)
  }
  const schedule = () => { timer ??= setTimeout(() => send(), 150) }
  watch(() => JSON.stringify(snapshot()), schedule)
  setInterval(() => send(), RUNTIME_INTERVAL_MS)
  void listen(EV_HELLO, () => { onHello(); send(true) })
}

/** Panel: applies the overlay's runtime broadcasts and asks for the current state. */
export function receiveRuntime(apply: (r: Runtime) => void): void {
  void listen<Runtime>(EV_RUNTIME, ({ payload }) => {
    mirroredDialogue.value = payload.dialogue
    apply(payload)
  }).then(() => emit(EV_HELLO))
}
