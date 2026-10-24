// When built-in lines play: petting and poking, a thinking filler while a reply is slow,
// waking from quiet mode, the greeting of a returning visitor, switching characters and
// moving aside. The agent and the reminder clock call playBuiltin themselves.

import { watch } from 'vue'
import { bus } from '@/core/bus'
import { useCharacterStore } from '@/character/store'
import { useSettings } from '@/stores/settings'
import { greetingCategory } from './builtin-lines'
import { playBuiltin } from './builtin'
import type { SpeechPlayer } from './player'

/** Fast petting must last this long before she protests. */
export const ROUGH_PET_AFTER_MS = 1200
/** A continuous rub gets a line at most this often. */
export const ROUGH_PET_GAP_MS = 5000
/** Slow petting must last this long before she says she likes it. */
export const SLOW_PET_AFTER_MS = 2000
export const SLOW_PET_GAP_MS = 15_000
export const POKE_GAP_MS = 3000
/** A filler plays when no reply has started this long after the user stopped speaking. */
export const FILLER_AFTER_MS = 1500
/** An observer line this recent already acknowledged the request or the move. */
const SPOKE_RECENTLY_MS = 1500

let lastObserverLineAt = -Infinity

/** Whether the observer just said something (it often acknowledges a request itself). */
export function observerSpokeRecently(now = performance.now()): boolean {
  return now - lastObserverLineAt < SPOKE_RECENTLY_MS
}

export function installCues(player: SpeechPlayer): void {
  const settings = useSettings()
  const character = useCharacterStore()

  bus.on('character:react', (r) => {
    if (r.line && r.source === 'observer') lastObserverLineAt = performance.now()
  })

  // ---- touch: rough petting (sustained fast), slow petting, poking --------------------
  let petTimer: ReturnType<typeof setTimeout> | null = null
  let petting: 'none' | 'slow' | 'fast' = 'none'
  let lastRoughAt = -Infinity
  let lastSlowAt = -Infinity
  let lastPokeAt = -Infinity

  const schedulePet = (ms: number) => {
    if (petTimer) clearTimeout(petTimer)
    petTimer = setTimeout(petCheck, Math.max(0, ms))
  }
  function petCheck() {
    petTimer = null
    const now = performance.now()
    // Never over another line (her reply, or the previous protest still playing).
    if (player.busy) { if (petting !== 'none') schedulePet(500); return }
    if (petting === 'fast') {
      if (now - lastRoughAt < ROUGH_PET_GAP_MS) return schedulePet(lastRoughAt + ROUGH_PET_GAP_MS - now)
      lastRoughAt = now
      playBuiltin('petFast')
      schedulePet(ROUGH_PET_GAP_MS)
    } else if (petting === 'slow') {
      if (now - lastSlowAt < SLOW_PET_GAP_MS || now - lastRoughAt < ROUGH_PET_GAP_MS) return
      lastSlowAt = now
      playBuiltin('petSlow')
    }
  }

  bus.on('character:touch', (t) => {
    if (t.kind === 'poke') {
      const now = performance.now()
      if (now - lastPokeAt < POKE_GAP_MS || player.busy) return
      lastPokeAt = now
      playBuiltin('poke')
      return
    }
    const next = t.holding ? t.petting : 'none'
    if (next === petting) return
    petting = next
    if (petTimer) clearTimeout(petTimer)
    petTimer = null
    if (next === 'fast') schedulePet(ROUGH_PET_AFTER_MS)
    else if (next === 'slow') schedulePet(SLOW_PET_AFTER_MS)
  })

  // ---- thinking filler: covers a slow reply, cut as soon as the real line starts -------
  let fillerTimer: ReturnType<typeof setTimeout> | null = null
  const cancelFiller = () => {
    if (fillerTimer) clearTimeout(fillerTimer)
    fillerTimer = null
  }
  bus.on('voice:speech-end', () => {
    cancelFiller()
    fillerTimer = setTimeout(() => {
      fillerTimer = null
      if (!player.busy) playBuiltin('filler')
    }, FILLER_AFTER_MS)
  })
  bus.on('voice:speech-start', cancelFiller)
  bus.on('tts:start', cancelFiller)
  bus.on('character:react', (r) => { if (r.line) cancelFiller() })
  bus.on('voice:transcript', (t) => { if (!t.text.trim()) cancelFiller() })

  // ---- waking from quiet mode -----------------------------------------------------------
  watch(() => settings.mode, (mode, prev) => {
    if (mode === 'active' && prev !== 'active' && settings.welcomed) playBuiltin('wake')
  })

  // ---- greeting: a returning visitor hears one on the first gesture (the first visit is
  // greeted by name in the welcome) ----------------------------------------------------
  if (settings.welcomed) {
    const greet = () => {
      window.removeEventListener('pointerdown', greet, true)
      window.removeEventListener('keydown', greet, true)
      // After the gesture has unlocked audio; a push-to-talk press cuts it via barge-in.
      setTimeout(() => playBuiltin(greetingCategory(new Date().getHours())), 250)
    }
    window.addEventListener('pointerdown', greet, true)
    window.addEventListener('keydown', greet, true)
  }

  // ---- switching characters: the new one introduces herself -----------------------------
  watch(() => character.character, (id, prev) => {
    if (id !== prev) playBuiltin('switch', { character: id })
  })

  // ---- moving aside on request (unless the observer already said something) ------------
  bus.on('assistant:move', ({ where }) => {
    if ((where === 'left' || where === 'right') && !observerSpokeRecently()) playBuiltin('move')
  })
}
