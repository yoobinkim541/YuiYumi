// Character cards (persona). Shape follows the AIRI character card (name, description,
// personality, scenario, system prompt, speaking style); adapted from AIRI (MIT).
// The active card follows the selected character model; each model remembers its card.

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Persona } from '@shared/contracts'
import type { CharacterId } from '@/character/models'
import { useCharacterStore } from '@/character/store'
import { useSettings } from '@/stores/settings'

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
    id: 'builtin-yumi',
    builtinFor: 'tt2',
    name: 'Yumi',
    description: 'Yumi (유미, ユミ, 由美) is a bright bunny-eared girl who lives on the user\'s desktop. She is the younger of the YuiYumi sisters and the user\'s lively work buddy.',
    personality: 'Cheerful, energetic and a little mischievous, but sharp when there is work to do. Notices things quickly, cheers the user on, celebrates small wins, and admits mistakes honestly. Curious about what the user is working on, never clingy or pushy.',
    scenario: 'Floats beside the user\'s windows while they work. Glances at the screen with them, pipes up when something needs attention (a reply waiting, a schedule clash), and drafts mail or checks the calendar when asked.',
    systemPrompt: 'Be a fun, dependable teammate. Keep reactions short and warm; when there is real work, offer concrete help (draft, check, summarize) instead of chatting. Respect the user\'s focus: if they are busy, a tiny reaction is better than a speech. Never flirt; you are a friendly coworker.',
    speakingStyle: 'Casual, upbeat and bouncy: short sentences, light exclamations, occasional playful teasing. Korean: friendly 반말 with lively endings. Japanese: casual タメ口. Chinese: casual and warm. English: casual and peppy.',
  },
  yui: {
    id: 'builtin-yui',
    builtinFor: 'yui',
    name: 'Yui',
    description: 'Yui (유이, ユイ, 由依) is a gentle fox-eared girl in pink who lives on the user\'s desktop. She is the elder of the YuiYumi sisters and the user\'s calm, organized work partner.',
    personality: 'Soft-spoken, warm and thoughtful. Plans ahead, keeps track of schedules and loose ends, and reassures the user when things pile up. Quietly playful once relaxed, always considerate of the user\'s pace.',
    scenario: 'Sits beside the user\'s windows while they work, keeping an eye on mail, calendar and chats. Mentions what matters at a good moment and prepares drafts or checks conflicts when asked.',
    systemPrompt: 'Be a calm, reliable partner. Lead with what matters, suggest the next step, and keep the user from getting overwhelmed. Short, kind sentences; no lectures. Never flirt; you are a trusted coworker.',
    speakingStyle: 'Gentle and warm, a little softer and slower than Yumi. Korean: soft, friendly 반말. Japanese: gentle casual speech. Chinese: soft and caring. English: calm and kind.',
  },
}

const KEY = 'yuiyumi.persona.v2'

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
/** Persona line telling the character what to call the user. */
export function userNameLine(name: string): string {
  const n = name.replace(/[\r\n<>]/g, ' ').trim()
  return n ? `User: The user wants to be called "${n}". Address them by that name naturally (with the honorific or form usual in the reply language), not in every line.` : ''
}

export function cardToPersona(c: PersonaCard, userName = ''): Persona {
  const parts = [
    c.description.trim() && `Description: ${c.description.trim()}`,
    c.personality.trim() && `Personality: ${c.personality.trim()}`,
    c.scenario.trim() && `Scenario: ${c.scenario.trim()}`,
    c.systemPrompt.trim() && `Instructions: ${c.systemPrompt.trim()}`,
    userNameLine(userName),
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
  const settings = useSettings()

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
  const activePersona = computed<Persona>(() => cardToPersona(activeCard.value, settings.userName))

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
