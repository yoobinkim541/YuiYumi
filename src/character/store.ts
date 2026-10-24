// Character choice, persisted in localStorage. CharacterLayer remounts the runtime when
// it changes; other UI (e.g. the control bar) can call setCharacter().
// The landing's character pages open the app with ?character=yui|yumi; that choice wins over
// the stored one, is saved, and the parameter is removed from the address bar.

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { CHARACTER_MODELS, DEFAULT_CHARACTER, isCharacterId, type CharacterId } from './models'

const KEY = 'yuiyumi.character'
const URL_PARAM = 'character'
/** Public names used in links; `tt2` is the internal id of Yumi's model. */
const URL_NAMES: Record<string, CharacterId> = { yui: 'yui', yumi: 'tt2', tt2: 'tt2' }

/** Reads and clears ?character=, returning the character it names, if any. */
function takeFromUrl(): CharacterId | null {
  try {
    const url = new URL(location.href)
    const v = url.searchParams.get(URL_PARAM)
    if (v === null) return null
    url.searchParams.delete(URL_PARAM)
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return URL_NAMES[v.toLowerCase()] ?? null
  }
  catch {
    return null
  }
}

function load(): CharacterId {
  const fromUrl = takeFromUrl()
  try {
    if (fromUrl) {
      localStorage.setItem(KEY, fromUrl)
      return fromUrl
    }
    const v = localStorage.getItem(KEY)
    return isCharacterId(v) ? v : DEFAULT_CHARACTER
  }
  catch {
    return fromUrl ?? DEFAULT_CHARACTER
  }
}

export const useCharacterStore = defineStore('character', () => {
  const character = ref<CharacterId>(load())
  watch(character, (v) => {
    try { localStorage.setItem(KEY, v) }
    catch { /* storage unavailable */ }
  })

  function setCharacter(id: CharacterId) {
    if (isCharacterId(id)) character.value = id
  }

  const options = Object.values(CHARACTER_MODELS).map(m => ({ id: m.id, label: m.label }))

  return { character, setCharacter, options }
})
