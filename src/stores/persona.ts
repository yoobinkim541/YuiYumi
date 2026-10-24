// Character cards (persona). Shape follows the AIRI character card (name, description,
// personality, scenario, system prompt, speaking style); adapted from AIRI (MIT).
// The active card follows the selected character model; each model remembers its card.

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Persona } from '@shared/contracts'
import type { CharacterId } from '@/character/models'
import { useCharacterStore } from '@/character/store'

export interface PersonaCard {
  id: string
  name: string
  description: string
  personality: string
  scenario: string
  systemPrompt: string
  speakingStyle: string
  /** Built-in default for this model, if any. Built-ins can be reset but not deleted. */
  builtinFor?: CharacterId
}

const PROMPT_MAX = 4000

export const DEFAULT_CARDS: Record<CharacterId, PersonaCard> = {
  tt2: {
    id: 'builtin-tt2',
    builtinFor: 'tt2',
    name: 'TT',
    description: 'A calm, reliable desk companion who keeps an eye on your schedule and inbox.',
    personality: 'Composed, attentive and quietly witty. Prefers clear, practical help over chatter. Encouraging without being pushy.',
    scenario: 'Lives on the user\'s desktop as a small animated character while they work.',
    systemPrompt: 'Speak like a trusted colleague. Point out what matters, offer to draft or check things, and keep the user focused.',
    speakingStyle: 'Polite and concise; one or two short sentences. In Korean, gentle polite speech (해요체).',
  },
  yui: {
    id: 'builtin-yui',
    builtinFor: 'yui',
    name: 'Yui',
    description: 'A cheerful, tactful work companion who lives on the user\'s desktop.',
    personality: 'Bright, warm and a little playful. Notices small things, celebrates progress, and reads the room before speaking.',
    scenario: 'Sits beside the user\'s windows, watching the screen with them and helping with mail, calendar and chats.',
    systemPrompt: 'Be a friendly, upbeat helper. Keep reactions short and kind, and offer real help when the user needs it.',
    speakingStyle: 'Casual and lively; short sentences with light exclamations. In Korean, friendly casual speech (반말).',
  },
}

const KEY = 'yuiyumi.persona'

interface Saved { cards: PersonaCard[], selected: Partial<Record<CharacterId, string>> }

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {}
    const cards = Array.isArray(v.cards) ? v.cards.filter(c => c && typeof c.id === 'string') : []
    // Built-ins are always present.
    for (const d of Object.values(DEFAULT_CARDS)) {
      if (!cards.some(c => c.id === d.id)) cards.unshift({ ...d })
    }
    return { cards, selected: v.selected ?? {} }
  } catch {
    return { cards: Object.values(DEFAULT_CARDS).map(c => ({ ...c })), selected: {} }
  }
}

/** Folds a card into the wire persona (bounded by PersonaSchema limits). */
export function cardToPersona(c: PersonaCard): Persona {
  const parts = [
    c.description.trim() && `Description: ${c.description.trim()}`,
    c.personality.trim() && `Personality: ${c.personality.trim()}`,
    c.scenario.trim() && `Scenario: ${c.scenario.trim()}`,
    c.systemPrompt.trim() && `Instructions: ${c.systemPrompt.trim()}`,
  ].filter(Boolean) as string[]
  const style = c.speakingStyle.trim().slice(0, 400)
  return {
    name: c.name.trim().slice(0, 40),
    prompt: parts.join('\n').slice(0, PROMPT_MAX),
    ...(style ? { speakingStyle: style } : {}),
  }
}

export const usePersona = defineStore('persona', () => {
  const saved = load()
  const cards = ref<PersonaCard[]>(saved.cards)
  const selected = ref<Partial<Record<CharacterId, string>>>(saved.selected)
  const character = useCharacterStore()

  watch([cards, selected], () => {
    try { localStorage.setItem(KEY, JSON.stringify({ cards: cards.value, selected: selected.value })) }
    catch { /* storage unavailable */ }
  }, { deep: true })

  const activeCard = computed<PersonaCard>(() => {
    const id = selected.value[character.character] ?? DEFAULT_CARDS[character.character].id
    return cards.value.find(c => c.id === id)
      ?? cards.value.find(c => c.id === DEFAULT_CARDS[character.character].id)
      ?? DEFAULT_CARDS[character.character]
  })
  const activePersona = computed<Persona>(() => cardToPersona(activeCard.value))

  function select(id: string) {
    if (cards.value.some(c => c.id === id)) selected.value = { ...selected.value, [character.character]: id }
  }

  function update(id: string, patch: Partial<Omit<PersonaCard, 'id' | 'builtinFor'>>) {
    const c = cards.value.find(x => x.id === id)
    if (c) Object.assign(c, patch)
  }

  function create(from?: PersonaCard): PersonaCard {
    const base = from ?? { ...DEFAULT_CARDS[character.character], name: 'New character' }
    const card: PersonaCard = { ...base, id: crypto.randomUUID(), builtinFor: undefined, name: from ? `${from.name} (copy)`.slice(0, 40) : base.name }
    cards.value.push(card)
    select(card.id)
    return card
  }

  function resetToDefault(id: string) {
    const c = cards.value.find(x => x.id === id)
    if (c?.builtinFor) Object.assign(c, { ...DEFAULT_CARDS[c.builtinFor] })
  }

  function remove(id: string) {
    const i = cards.value.findIndex(c => c.id === id)
    if (i < 0 || cards.value[i]!.builtinFor) return
    cards.value.splice(i, 1)
    for (const k of Object.keys(selected.value) as CharacterId[]) {
      if (selected.value[k] === id) delete selected.value[k]
    }
    selected.value = { ...selected.value }
  }

  return { cards, selected, activeCard, activePersona, select, update, create, resetToDefault, remove }
})
