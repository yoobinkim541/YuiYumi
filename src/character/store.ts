// Character choice, persisted in localStorage. CharacterLayer remounts the runtime when
// it changes; other UI (e.g. the control bar) can call setCharacter().

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { CHARACTER_MODELS, DEFAULT_CHARACTER, isCharacterId, type CharacterId } from './models'

const KEY = 'yuiyumi.character'

function load(): CharacterId {
  try {
    const v = localStorage.getItem(KEY)
    return isCharacterId(v) ? v : DEFAULT_CHARACTER
  }
  catch {
    return DEFAULT_CHARACTER
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
