<script setup lang="ts">
// Settings window. Layout and look adapted from AIRI (MIT): settings menu of icon items
// (title, description, faded icon), page header with a large background icon, character
// card grid and editor (airi-card), radio cards and field rows. Re-created in plain CSS.

import { computed, ref } from 'vue'
import type { ConnectorService } from '@shared/contracts'
import { LANG_INFO, LANGS } from '@shared/languages'
import { CHARACTER_MODELS, type CharacterId } from '@/character/models'
import { useCharacterStore } from '@/character/store'
import { LIVE_SERVICES } from '@/connectors/registry'
import { nunchiStatus } from '@/nunchi'
import { NUNCHI_DEFAULTS, nunchiConfig, resetNunchiConfig } from '@/nunchi/config'
import { POLL_MS } from '@/nunchi/scheduler'
import { usePersona, type PersonaCard } from '@/stores/persona'
import { useSettings, type AssistantMode } from '@/stores/settings'
import { setVadEnabled, voiceState } from '@/voice'
import Icon from './Icon.vue'
import './theme.css'

type PageId = 'card' | 'general' | 'voice' | 'observation' | 'connectors' | 'about'

const PAGES: { id: PageId, title: string, description: string, icon: string }[] = [
  { id: 'card', title: 'Character card', description: 'Persona, personality and model', icon: 'card' },
  { id: 'general', title: 'General', description: 'Language, sound and mode', icon: 'settings' },
  { id: 'voice', title: 'Voice', description: 'Microphone and speech output', icon: 'mic' },
  { id: 'observation', title: 'Observation', description: 'Screen checks and interjection limits', icon: 'eye' },
  { id: 'connectors', title: 'Connectors', description: 'Mail, calendar, drive and chats', icon: 'plug' },
  { id: 'about', title: 'About', description: 'Open source notices', icon: 'info' },
]

const page = ref<PageId>('card')
const current = computed(() => PAGES.find(p => p.id === page.value)!)

const settings = useSettings()
const character = useCharacterStore()
const persona = usePersona()

// --- Character card

const MODEL_IDS = Object.keys(CHARACTER_MODELS) as CharacterId[]
const editing = computed(() => persona.activeCard)

const CARD_FIELDS: { key: keyof Omit<PersonaCard, 'id' | 'builtinFor'>, label: string, sub: string, rows: number, max: number }[] = [
  { key: 'description', label: 'Description', sub: 'Who the character is, in a sentence or two.', rows: 2, max: 600 },
  { key: 'personality', label: 'Personality', sub: 'Temperament and habits.', rows: 3, max: 800 },
  { key: 'scenario', label: 'Scenario', sub: 'Where and how the character meets the user.', rows: 2, max: 600 },
  { key: 'systemPrompt', label: 'System prompt', sub: 'Extra instructions. Safety rules always win over this card.', rows: 4, max: 1800 },
  { key: 'speakingStyle', label: 'Speaking style', sub: 'Tone and register. Replies still follow the selected language.', rows: 2, max: 400 },
]

function setField(key: keyof Omit<PersonaCard, 'id' | 'builtinFor'>, value: string) {
  persona.update(editing.value.id, { [key]: value })
}

function cardInitial(c: PersonaCard) {
  return (c.name.trim()[0] ?? '?').toUpperCase()
}

// --- General

const MODES: { id: AssistantMode, title: string, description: string }[] = [
  { id: 'active', title: 'Active', description: 'Watches the screen and may speak up' },
  { id: 'quiet', title: 'Quiet', description: 'Answers only when spoken to' },
  { id: 'ornamental', title: 'Ornamental', description: 'Just stays on the desktop' },
]

// --- Observation

const cooldownMin = computed({
  get: () => Math.round(nunchiConfig.cooldownMs / 60_000),
  set: (v: number) => { nunchiConfig.cooldownMs = clamp(v, 0, 240) * 60_000 },
})
const maxPerDay = computed({
  get: () => nunchiConfig.maxPerDay,
  set: (v: number) => { nunchiConfig.maxPerDay = clamp(v, 0, 50) },
})
const minDwell = computed({
  get: () => nunchiConfig.minDwellSec,
  set: (v: number) => { nunchiConfig.minDwellSec = clamp(v, 0, 600) },
})
function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo
}

// --- Connectors

const CONNECTORS: { id: ConnectorService, title: string, icon: string, description: string, liveCapable: boolean }[] = [
  { id: 'mail', title: 'Gmail', icon: 'mail', description: 'Read inbox, save reply drafts (never sends)', liveCapable: false },
  { id: 'calendar', title: 'Calendar', icon: 'calendar', description: 'List events, find conflicts, create events', liveCapable: false },
  { id: 'drive', title: 'Drive', icon: 'drive', description: 'Search and read files', liveCapable: false },
  { id: 'slack', title: 'Slack', icon: 'slack', description: 'Read channels, put replies in the composer', liveCapable: true },
  { id: 'discord', title: 'Discord', icon: 'discord', description: 'Read channels', liveCapable: true },
]
// Mirror of the registry flags; the registry reads LIVE_SERVICES on every call.
const live = ref<Partial<Record<ConnectorService, boolean>>>({ ...LIVE_SERVICES })
function toggleLive(id: ConnectorService) {
  const on = !live.value[id]
  live.value = { ...live.value, [id]: on }
  LIVE_SERVICES[id] = on
}
</script>

<template>
  <div class="yy-airi settings-app">
    <!-- Sidebar: AIRI settings menu (icon items) -->
    <nav class="side scroll">
      <div class="brand">
        <Icon name="settings" :size="18" />
        <span>Settings</span>
      </div>
      <button
        v-for="p in PAGES" :key="p.id" type="button"
        class="menu-item" :class="{ active: page === p.id }"
        @click="page = p.id"
      >
        <span class="mi-text">
          <span class="mi-title">{{ p.title }}</span>
          <span class="mi-desc">{{ p.description }}</span>
        </span>
        <span class="mi-icon"><Icon :name="p.icon" :size="52" /></span>
      </button>
    </nav>

    <main class="content-wrap">
      <div class="page-bg-icon"><Icon :name="current.icon" :size="220" /></div>
      <div class="content scroll">
      <header class="page-head">
        <h1>{{ current.title }}</h1>
        <p>{{ current.description }}</p>
      </header>

      <!-- Character card (AIRI airi-card) -->
      <template v-if="page === 'card'">
        <section class="section">
          <h2>Model</h2>
          <p class="hint">Each model remembers its own character card.</p>
          <div class="radio-grid">
            <button
              v-for="id in MODEL_IDS" :key="id" type="button"
              class="radio-card model-card" :class="{ active: character.character === id }"
              @click="character.setCharacter(id)"
            >
              <img :src="CHARACTER_MODELS[id].icon" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'">
              <b>{{ CHARACTER_MODELS[id].label }}</b>
              <span>{{ character.character === id ? 'In use' : 'Switch to this model' }}</span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="sec-head">
            <div>
              <h2>Cards</h2>
              <p class="hint">Pick the card for {{ CHARACTER_MODELS[character.character].label }}.</p>
            </div>
            <div class="actions">
              <button type="button" class="btn" @click="persona.create()"><Icon name="plus" :size="15" />New</button>
              <button type="button" class="btn" @click="persona.create(editing)"><Icon name="copy" :size="15" />Duplicate</button>
            </div>
          </div>
          <div class="card-grid">
            <button
              v-for="c in persona.cards" :key="c.id" type="button"
              class="char-card" :class="{ active: persona.activeCard.id === c.id }"
              @click="persona.select(c.id)"
            >
              <span class="avatar">{{ cardInitial(c) }}</span>
              <span class="cc-text">
                <b>{{ c.name || 'Untitled' }}</b>
                <span>{{ c.description || 'No description' }}</span>
              </span>
              <span v-if="c.builtinFor" class="badge">Default · {{ CHARACTER_MODELS[c.builtinFor].label }}</span>
              <span v-if="persona.activeCard.id === c.id" class="cc-check"><Icon name="check" :size="14" /></span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="sec-head">
            <div>
              <h2>Edit “{{ editing.name || 'Untitled' }}”</h2>
              <p class="hint">Changes save automatically and apply to the next observation and task.</p>
            </div>
            <div class="actions">
              <button v-if="editing.builtinFor" type="button" class="btn" @click="persona.resetToDefault(editing.id)"><Icon name="reset" :size="15" />Reset to default</button>
              <button v-else type="button" class="btn danger" @click="persona.remove(editing.id)"><Icon name="trash" :size="15" />Delete</button>
            </div>
          </div>
          <div class="field">
            <label>Name <span class="sub">— shown and used by the character (max 40)</span></label>
            <input type="text" maxlength="40" :value="editing.name" @input="setField('name', ($event.target as HTMLInputElement).value)">
          </div>
          <div v-for="f in CARD_FIELDS" :key="f.key" class="field">
            <label>{{ f.label }} <span class="sub">— {{ f.sub }}</span></label>
            <textarea :rows="f.rows" :maxlength="f.max" :value="editing[f.key]" @input="setField(f.key, ($event.target as HTMLTextAreaElement).value)" />
          </div>
        </section>
      </template>

      <!-- General -->
      <template v-else-if="page === 'general'">
        <section class="section">
          <h2>Language</h2>
          <p class="hint">Speech recognition, replies and the voice all follow this language.</p>
          <div class="radio-grid">
            <button
              v-for="l in LANGS" :key="l" type="button"
              class="radio-card" :class="{ active: settings.lang === l }"
              @click="settings.lang = l"
            >
              <b>{{ LANG_INFO[l].label }}</b><span>{{ l }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <h2>Mode</h2>
          <p class="hint">Quiet and ornamental modes never capture the screen.</p>
          <div class="radio-grid">
            <button
              v-for="m in MODES" :key="m.id" type="button"
              class="radio-card" :class="{ active: settings.mode === m.id }"
              @click="settings.mode = m.id"
            >
              <b>{{ m.title }}</b><span>{{ m.description }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <div class="row">
            <div class="txt"><b>Sound</b><span>Speak lines aloud. Turning it off stops the current line.</span></div>
            <button type="button" class="switch" :class="{ on: settings.sound }" :aria-pressed="settings.sound" @click="settings.sound = !settings.sound" />
          </div>
        </section>
      </template>

      <!-- Voice -->
      <template v-else-if="page === 'voice'">
        <section class="section">
          <h2>Input</h2>
          <p class="hint">Push-to-talk is the default. Voice activity detection listens hands-free.</p>
          <div class="radio-grid">
            <button type="button" class="radio-card" :class="{ active: !voiceState.vadEnabled }" @click="setVadEnabled(false)">
              <b>Push-to-talk</b><span>Hold the talk button or key</span>
            </button>
            <button type="button" class="radio-card" :class="{ active: voiceState.vadEnabled }" :disabled="voiceState.vadLoading" @click="setVadEnabled(true)">
              <b>Voice activity (VAD)</b><span>{{ voiceState.vadLoading ? 'Loading model…' : 'Listens when you speak' }}</span>
            </button>
          </div>
          <p v-if="voiceState.error" class="error">{{ voiceState.error }}</p>
        </section>
        <section class="section">
          <h2>Output</h2>
          <div class="row">
            <div class="txt"><b>Text to speech</b><span>Voice for {{ LANG_INFO[settings.lang].label }}. Same switch as Sound in General.</span></div>
            <button type="button" class="switch" :class="{ on: settings.sound }" :aria-pressed="settings.sound" @click="settings.sound = !settings.sound" />
          </div>
          <div class="row">
            <div class="txt"><b>Status</b><span>{{ voiceState.speaking ? 'Speaking now' : voiceState.transcribing ? 'Transcribing' : 'Idle' }}</span></div>
            <span class="badge" :class="voiceState.speaking ? 'primary' : 'mock'"><span class="dot" />{{ voiceState.speaking ? 'speaking' : 'idle' }}</span>
          </div>
        </section>
      </template>

      <!-- Observation -->
      <template v-else-if="page === 'observation'">
        <section class="section">
          <h2>Screen checks</h2>
          <div class="row">
            <div class="txt"><b>Interval</b><span>A screenshot is checked every {{ POLL_MS / 1000 }} seconds in active mode.</span></div>
            <span class="badge primary">{{ POLL_MS / 1000 }} s</span>
          </div>
          <div class="row">
            <div class="txt"><b>Today</b><span>Proactive interjections shown today.</span></div>
            <span class="badge">{{ nunchiStatus.interjectionsToday }} / {{ nunchiConfig.maxPerDay }}</span>
          </div>
        </section>
        <section class="section">
          <div class="sec-head">
            <div>
              <h2>Proactive limits</h2>
              <p class="hint">Only unprompted remarks are limited. Answers to your voice are never counted.</p>
            </div>
            <button type="button" class="btn" @click="resetNunchiConfig()"><Icon name="reset" :size="15" />Defaults</button>
          </div>
          <div class="row">
            <div class="txt"><b>Daily maximum</b><span>Default {{ NUNCHI_DEFAULTS.maxPerDay }}</span></div>
            <input v-model.number="maxPerDay" type="number" min="0" max="50">
          </div>
          <div class="row">
            <div class="txt"><b>Minimum interval (minutes)</b><span>Default {{ NUNCHI_DEFAULTS.cooldownMs / 60_000 }}</span></div>
            <input v-model.number="cooldownMin" type="number" min="0" max="240">
          </div>
          <div class="row">
            <div class="txt"><b>Dwell before speaking (seconds)</b><span>Same screen for at least this long. Default {{ NUNCHI_DEFAULTS.minDwellSec }}</span></div>
            <input v-model.number="minDwell" type="number" min="0" max="600">
          </div>
        </section>
      </template>

      <!-- Connectors -->
      <template v-else-if="page === 'connectors'">
        <section class="section">
          <p class="hint">Nothing can be sent or deleted. Writes are drafts and need your confirmation. Live reads fall back to mock data on failure.</p>
          <div v-for="c in CONNECTORS" :key="c.id" class="row">
            <div class="conn">
              <span class="conn-icon"><Icon :name="c.icon" :size="20" /></span>
              <div class="txt"><b>{{ c.title }}</b><span>{{ c.description }}</span></div>
            </div>
            <div class="conn-right">
              <span class="badge" :class="live[c.id] ? 'live' : 'mock'"><span class="dot" />{{ live[c.id] ? 'Live' : 'Mock' }}</span>
              <button v-if="c.liveCapable" type="button" class="switch" :class="{ on: live[c.id] }" :aria-label="`Live ${c.title}`" @click="toggleLive(c.id)" />
            </div>
          </div>
        </section>
      </template>

      <!-- About -->
      <template v-else>
        <section class="section">
          <h2>YuiYumi</h2>
          <p class="hint">A desktop companion that watches with you, speaks up rarely, and drafts work for you to send.</p>
        </section>
        <section class="section">
          <h2>Open source notices</h2>
          <p class="hint">Full list with licenses and usage: THIRD_PARTY_NOTICES.md in the repository root.</p>
          <ul class="notices">
            <li><b>AIRI</b> (moeru-ai/airi) — MIT. Live2D wiring, audio pipeline, lip sync structure, and the look of these settings and dashboard windows.</li>
            <li><b>Ayagami</b> — MIT OR Apache-2.0. Character core built to WASM.</li>
            <li><b>pixi.js</b>, <b>pixi-live2d-display</b> — MIT. Character rendering.</li>
            <li><b>Vue</b>, <b>Vite</b>, <b>Pinia</b>, <b>zod</b>, <b>modern-screenshot</b>, <b>jszip</b> — MIT.</li>
            <li><b>@ricky0123/vad-web</b> (ISC), <b>Silero VAD</b>, <b>onnxruntime-web</b>, <b>wLipSync</b> — MIT.</li>
            <li><b>Anthropic SDK</b> (Apache-2.0), <b>Deepgram SDK</b>, <b>ElevenLabs SDK</b> (MIT).</li>
            <li>Live2D Cubism Core and character models are not redistributed in the repository.</li>
          </ul>
        </section>
      </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.side {
  flex: none; width: 236px; padding: 14px 12px; display: flex; flex-direction: column; gap: 8px;
  background: var(--n50); border-right: 2px solid var(--n100);
}
.brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 8px; font-weight: 600; color: var(--n700); }
.menu-item {
  position: relative; overflow: hidden; display: flex; align-items: center; width: 100%; text-align: left;
  font: inherit; color: inherit; cursor: pointer; padding: 12px 14px; border-radius: 10px;
  background: #fff; border: 2px solid var(--n100); transition: all .35s ease-in-out;
}
.menu-item:hover { border-color: rgb(34 169 210 / .3); box-shadow: 0 4px 4px rgb(220 220 220 / .4); }
.menu-item.active { border-color: var(--p300); background: var(--p50); }
.mi-text { position: relative; z-index: 1; display: flex; flex-direction: column; min-width: 0; }
.mi-title { font-size: 15px; transition: color .35s; }
.mi-desc { font-size: 12px; color: var(--n500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu-item:hover .mi-title, .menu-item.active .mi-title { color: var(--p600); }
.mi-icon { position: absolute; right: -10px; top: 50%; transform: translateY(-30%); color: rgb(163 163 163 / .16); transition: all .35s; }
.menu-item:hover .mi-icon, .menu-item.active .mi-icon { color: rgb(34 169 210 / .22); transform: translateY(-36%) rotate(-6deg); }

.content-wrap { position: relative; flex: 1; min-width: 0; overflow: hidden; }
.content-wrap .page-bg-icon { position: absolute; right: -36px; bottom: -36px; z-index: 0; color: rgb(229 229 229 / .55); }
.content { position: relative; z-index: 1; height: 100%; padding: 22px 26px 30px; }

.sec-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.model-card { align-items: flex-start; }
.model-card img { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: var(--n100); margin-bottom: 4px; }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.char-card {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; text-align: left;
  font: inherit; color: inherit; cursor: pointer; padding: 12px; border-radius: 12px;
  background: #fff; border: 2px solid var(--n100); transition: all .25s;
}
.char-card:hover { border-color: var(--p200); }
.char-card.active { border-color: var(--p400); background: var(--p50); }
.avatar {
  width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-weight: 600;
  background: linear-gradient(135deg, var(--p200), var(--p400)); color: #fff;
}
.cc-text { display: flex; flex-direction: column; min-width: 0; width: 100%; }
.cc-text b { font-weight: 500; }
.cc-text span { font-size: 12px; color: var(--n500); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cc-check { position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--p500); color: #fff; }

.conn { display: flex; align-items: center; gap: 12px; min-width: 0; }
.conn-icon { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; background: #fff; border: 2px solid var(--n100); color: var(--n600); }
.conn-right { display: flex; align-items: center; gap: 10px; }

.error { margin: 10px 0 0; color: #dc2626; font-size: 12.5px; }
.notices { margin: 0; padding-left: 18px; color: var(--n600); font-size: 13px; }
.notices li { margin: 4px 0; }
.radio-card:disabled { opacity: .5; cursor: wait; }
</style>
