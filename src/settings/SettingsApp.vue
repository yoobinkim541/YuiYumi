<script setup lang="ts">
// Settings window. Look adapted from AIRI (MIT): index of menu items with large faded
// icons, sticky page header with a back button, console-style sections, the character
// card grid and editor, radio cards and field rows. Re-created in plain CSS.

import { computed, onBeforeUnmount, ref } from 'vue'
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
import { captureShortcut, DEFAULT_PTT, isMacPlatform, shortcutCaps } from './shortcut'
import type { VoicePreset } from '@shared/contracts'

const VOICE_STYLES: { id: VoicePreset, title: string, desc: string }[] = [
  { id: 'lively', title: 'Lively (default)', desc: 'Spoken and expressive, about 0.6 s' },
  { id: 'conversational', title: 'Conversational', desc: 'Most natural, about 3–4 s' },
  { id: 'fast', title: 'Fast', desc: 'Quickest, flatter delivery' },
]
import './theme.css'

type PageId = 'index' | 'card' | 'general' | 'voice' | 'observation' | 'connectors' | 'about'

const PAGES: { id: PageId, title: string, description: string, icon: string }[] = [
  { id: 'card', title: 'Character', description: 'Model and character card', icon: 'card' },
  { id: 'general', title: 'General', description: 'Language, mode and sound', icon: 'settings' },
  { id: 'voice', title: 'Voice input', description: 'Push-to-talk shortcut, VAD', icon: 'mic' },
  { id: 'observation', title: 'Observation', description: 'Limits for unprompted remarks', icon: 'eye' },
  { id: 'connectors', title: 'Connectors', description: 'Mock or live data per service', icon: 'plug' },
  { id: 'about', title: 'About', description: 'Open source notices', icon: 'info' },
]

const page = ref<PageId>('index')
const current = computed(() => PAGES.find(p => p.id === page.value))
const scroller = ref<HTMLElement | null>(null)

function go(id: PageId) {
  stopRecording()
  page.value = id
  scroller.value?.scrollTo({ top: 0 })
}

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

// --- Voice input: push-to-talk shortcut recorder

const mac = isMacPlatform()
const pttCaps = computed(() => shortcutCaps(settings.pttKey, mac))
const recording = ref(false)
const recordError = ref('')

/** Capture-phase window listener so the next key goes here, not to push-to-talk. */
function onRecordKey(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.type !== 'keydown' || e.repeat) return
  const res = captureShortcut(e)
  if (res.kind === 'wait') return
  if (res.kind === 'reject') { recordError.value = res.reason; return }
  if (res.kind === 'ok') settings.pttKey = res.shortcut
  recordError.value = ''
  stopRecording()
}

function startRecording() {
  if (recording.value) { recordError.value = ''; stopRecording(); return }
  recording.value = true
  recordError.value = ''
  window.addEventListener('keydown', onRecordKey, true)
  window.addEventListener('keyup', onRecordKey, true)
  window.addEventListener('blur', stopRecording)
}

function stopRecording() {
  if (!recording.value) return
  recording.value = false
  window.removeEventListener('keydown', onRecordKey, true)
  window.removeEventListener('keyup', onRecordKey, true)
  window.removeEventListener('blur', stopRecording)
}

function resetPtt() {
  stopRecording()
  recordError.value = ''
  settings.pttKey = { ...DEFAULT_PTT }
}

onBeforeUnmount(stopRecording)

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
    <div ref="scroller" class="content scroll">
      <div class="inner">
        <!-- Page header (AIRI PageHeader): back arrow, small subtitle above a large title -->
        <header class="page-header">
          <button type="button" class="back" :class="{ hidden: !current }" aria-label="Back" @click="go('index')">
            <Icon name="chevron-left" :size="26" />
          </button>
          <h1>
            <span v-if="current" class="subtitle">Settings</span>
            <span class="title">{{ current ? current.title : 'Settings' }}</span>
          </h1>
        </header>

        <!-- Index: AIRI menu icon items -->
        <div v-if="page === 'index'" class="menu">
          <button
            v-for="(p, i) in PAGES" :key="p.id" type="button"
            class="menu-icon-item" :style="{ animationDelay: `${i * 50}ms` }"
            @click="go(p.id)"
          >
            <span class="mi-text">
              <span class="mi-title">{{ p.title }}</span>
              <span class="mi-desc">{{ p.description }}</span>
            </span>
            <span class="mi-icon"><Icon :name="p.icon" :size="72" /></span>
          </button>
        </div>

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
              <span class="cc-body">
                <span class="cc-head">
                  <span class="avatar">{{ cardInitial(c) }}</span>
                  <b>{{ c.name || 'Untitled' }}</b>
                  <span v-if="persona.activeCard.id === c.id" class="cc-check"><Icon name="check" :size="14" /></span>
                </span>
                <span class="cc-desc">{{ c.description || 'No description' }}</span>
                <span class="cc-stats">{{ c.builtinFor ? `Default · ${CHARACTER_MODELS[c.builtinFor].label}` : 'Custom' }}</span>
              </span>
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

      <!-- Voice input -->
      <template v-else-if="page === 'voice'">
        <section class="section">
          <h2>Push-to-talk shortcut</h2>
          <p class="hint">Letters and digits need Ctrl, Alt or {{ mac ? 'Cmd' : 'Win' }} so typing on the desktop is not taken over. A shortcut without those keys is ignored while you type in a text field.</p>
          <div class="row">
            <div class="txt">
              <b>Push-to-talk (default)</b>
              <span>{{ recording ? 'Press the new key combination. Esc cancels.' : 'Hold to talk. Works anywhere on the desktop.' }}</span>
            </div>
            <div class="ptt-right">
              <span class="caps" :class="{ armed: recording }" aria-live="polite">
                <template v-if="recording"><kbd class="cap wait">…</kbd></template>
                <kbd v-for="(k, i) in pttCaps" v-else :key="i" class="cap">{{ k }}</kbd>
              </span>
              <button type="button" class="btn" :class="{ primary: recording }" @click="startRecording">
                <Icon name="keyboard" :size="15" />{{ recording ? 'Cancel' : 'Record shortcut' }}
              </button>
              <button type="button" class="btn" :disabled="!recording && settings.pttKey.code === 'Space' && pttCaps.length === 1" @click="resetPtt">
                <Icon name="reset" :size="15" />Space
              </button>
            </div>
          </div>
          <p v-if="recordError" class="error">{{ recordError }}</p>
        </section>
        <section class="section">
          <h2>Voice style</h2>
          <p class="hint">How the character's voice is generated. Lively is the default.</p>
          <div class="radio-grid">
            <button
              v-for="v in VOICE_STYLES" :key="v.id" type="button" class="radio-card"
              :class="{ active: settings.voicePreset === v.id }" @click="settings.voicePreset = v.id"
            >
              <b>{{ v.title }}</b><span>{{ v.desc }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <h2>VAD</h2>
          <p class="hint">Voice activity detection listens hands-free and sends what you say when you stop. Push-to-talk keeps working while it is on.</p>
          <div class="row">
            <div class="txt">
              <b>Voice activity detection</b>
              <span>{{ voiceState.vadLoading ? 'Loading model…' : voiceState.vadEnabled ? 'Listening for speech' : 'Off' }}</span>
            </div>
            <button
              type="button" class="switch" :class="{ on: voiceState.vadEnabled }" :aria-pressed="voiceState.vadEnabled"
              aria-label="Voice activity detection" :disabled="voiceState.vadLoading"
              @click="setVadEnabled(!voiceState.vadEnabled)"
            />
          </div>
          <p v-if="voiceState.error" class="error">{{ voiceState.error }}</p>
        </section>
      </template>

      <!-- Observation -->
      <template v-else-if="page === 'observation'">
        <section class="section">
          <div class="sec-head">
            <div>
              <h2>Proactive limits</h2>
              <p class="hint">In active mode the screen is checked every {{ POLL_MS / 1000 }} s. Only unprompted remarks are limited; answers to your voice never count. Today: {{ nunchiStatus.interjectionsToday }} of {{ nunchiConfig.maxPerDay }}.</p>
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
      <template v-else-if="page === 'about'">
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
            <li><b>cubism-web-batched-renderer</b> — Live2D Open Software License. <b>pixi.js</b>, <b>pixi-live2d-display</b> — MIT. Character rendering.</li>
            <li><b>Vue</b>, <b>Vite</b>, <b>Pinia</b>, <b>zod</b>, <b>modern-screenshot</b>, <b>jszip</b> — MIT.</li>
            <li><b>@ricky0123/vad-web</b> (ISC), <b>Silero VAD</b>, <b>onnxruntime-web</b>, <b>wLipSync</b> — MIT.</li>
            <li><b>Anthropic SDK</b> (Apache-2.0), <b>Deepgram SDK</b>, <b>ElevenLabs SDK</b> (MIT).</li>
            <li>Live2D Cubism Core and character models are not redistributed in the repository.</li>
          </ul>
        </section>
      </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-app { display: block; background: #fff; }
.content { height: 100%; }
.inner { max-width: 1280px; margin: 0 auto; padding: 0 16px 48px; display: flex; flex-direction: column; }

.page-header {
  position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px;
  padding: 36px 0 24px; background: #fff;
}
.back { display: grid; place-items: center; border: 0; padding: 0; background: none; color: var(--n800); cursor: pointer; }
.back.hidden { opacity: 0; pointer-events: none; }
.page-header h1 { position: relative; margin: 0; font-weight: 400; }
.page-header .subtitle { position: absolute; left: 0; top: 0; transform: translateY(-80%); font-size: 15px; color: var(--n300); white-space: nowrap; }
.page-header .title { display: block; font-size: 30px; line-height: 1.2; color: var(--n900); white-space: nowrap; }

.menu { display: flex; flex-direction: column; gap: 10px; }
.menu-icon-item {
  position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; width: 100%;
  padding: 14px 20px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: var(--n50); border: 2px solid var(--n100); border-radius: 8px;
  transition: all .4s ease-in-out; animation: mi-enter .25s ease-out both;
}
.menu-icon-item::before {
  content: ''; position: absolute; inset: 0; z-index: -1; width: 25%; height: 100%; opacity: 0;
  background: linear-gradient(90deg, rgb(34 169 210 / .2), rgb(34 169 210 / .1), transparent);
  mask-image: linear-gradient(120deg, white 30%, transparent 50%); transition: all .4s ease-in-out;
}
.menu-icon-item::after {
  content: ''; position: absolute; inset: 0; z-index: -2;
  background-image: radial-gradient(circle, rgb(229 229 229 / .6) 1px, transparent 1px); background-size: 10px 10px;
  mask-image: linear-gradient(165deg, white 30%, transparent 50%); transition: all .4s ease-in-out;
}
.menu-icon-item:hover { border-color: rgb(34 169 210 / .3); filter: drop-shadow(0 4px 4px rgb(220 220 220 / .4)); }
.menu-icon-item:active { filter: none; }
.menu-icon-item:hover::before { width: 85%; opacity: 1; }
.menu-icon-item:hover::after { background-image: radial-gradient(circle, rgb(127 210 235 / .5) 1px, transparent 1px); }
.mi-text { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; min-width: 0; }
.mi-title { font-size: 18px; font-weight: 400; transition: color .4s ease-in-out; }
.mi-desc { font-size: 14px; color: var(--n500); transition: all .4s ease-in-out; }
.menu-icon-item:hover .mi-title { color: var(--p600); }
.menu-icon-item:hover .mi-desc { color: var(--p600); opacity: .8; }
.mi-icon { position: absolute; right: 0; top: 50%; display: grid; transform: translateY(-34%); color: rgb(163 163 163 / .5); opacity: .5; transition: all .4s ease-in-out; }
.menu-icon-item:hover .mi-icon { color: var(--p500); scale: 1.2; }
@keyframes mi-enter { from { opacity: 0; transform: translateY(10px); } }

.sec-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.model-card { align-items: flex-start; }
.model-card img { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: var(--n100); margin-bottom: 4px; }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.char-card {
  position: relative; isolation: isolate; display: flex; flex-direction: column; min-height: 120px; overflow: hidden;
  padding: 0; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: rgb(229 229 229 / .5); border: 2px solid var(--n100); border-radius: 12px; transition: all .4s ease-in-out;
}
.char-card::before {
  content: ''; position: absolute; inset: 0; z-index: 0; width: 25%; opacity: 0; pointer-events: none;
  background: linear-gradient(90deg, rgb(34 169 210 / .2), rgb(34 169 210 / .1), transparent); transition: all .4s ease-in-out;
}
.char-card:hover { filter: drop-shadow(0 4px 4px rgb(220 220 220 / .4)); }
.char-card:hover::before { opacity: 1; width: 100%; }
.char-card.active { border-color: var(--p400); }
.cc-body {
  position: relative; z-index: 1; isolation: isolate; flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;
  padding: 16px 18px; border-radius: 8px; background: #fff; overflow: hidden; transition: color .4s ease-in-out;
}
.cc-body::after {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background-image: radial-gradient(circle, rgb(229 229 229 / .8) 1px, transparent 1px); background-size: 10px 10px;
  mask-image: linear-gradient(165deg, white 30%, transparent 50%); transition: all .4s ease-in-out;
}
.char-card:hover .cc-body { color: rgb(23 137 173 / .8); }
.char-card:hover .cc-body::after { background-image: radial-gradient(circle, rgb(127 210 235 / .5) 1px, transparent 1px); }
.cc-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cc-head b { flex: 1; min-width: 0; font-size: 18px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.avatar {
  flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-weight: 500; font-size: 14px;
  background: linear-gradient(135deg, var(--p200), var(--p400)); color: #fff;
}
.cc-check { flex: none; padding: 4px; border-radius: 6px; display: grid; place-items: center; background: var(--p100); color: var(--p600); }
.cc-desc { min-height: 40px; font-size: 13px; color: var(--n500); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cc-stats { font-size: 12px; color: var(--n500); }

.ptt-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.caps { display: inline-flex; gap: 4px; padding: 3px; border-radius: 10px; transition: box-shadow .2s; }
.caps.armed { box-shadow: 0 0 0 2px var(--p300); }
.cap {
  min-width: 30px; height: 30px; padding: 0 9px; display: inline-grid; place-items: center;
  font: 500 13px/1 inherit; font-family: inherit; color: var(--n800);
  background: #fff; border: 2px solid var(--n200); border-bottom-width: 3px; border-radius: 7px;
}
.cap.wait { color: var(--p500); animation: cap-blink 1s ease-in-out infinite; }
@keyframes cap-blink { 50% { opacity: .35; } }

.conn { display: flex; align-items: center; gap: 12px; min-width: 0; }
.conn-icon { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; background: #fff; border: 2px solid var(--n100); color: var(--n600); }
.conn-right { display: flex; align-items: center; gap: 10px; }

.error { margin: 10px 0 0; color: #dc2626; font-size: 12.5px; }
.notices { margin: 0; padding-left: 18px; color: var(--n600); font-size: 13px; }
.notices li { margin: 4px 0; }
.radio-card:disabled { opacity: .5; cursor: wait; }
</style>
