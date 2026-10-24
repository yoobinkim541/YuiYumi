<script setup lang="ts">
// Settings window. Look adapted from AIRI (MIT): index of menu items with large faded
// icons, sticky page header with a back button, console-style sections, the character
// card grid and editor, radio cards and field rows. Re-created in plain CSS.

import { computed, onBeforeUnmount, ref } from 'vue'
import { AGENT_MODELS, PERMISSION_LEVELS, VOICE_PRESETS } from '@shared/contracts'
import { LANG_INFO, LANGS } from '@shared/languages'
import { CHARACTER_MODELS, type CharacterId } from '@/character/models'
import { useCharacterStore } from '@/character/store'
import { usePersona, type PersonaCard } from '@/stores/persona'
import { USER_NAME_MAX, useSettings, type AssistantMode } from '@/stores/settings'
import { setVadEnabled, voiceState } from '@/voice'
import { inTauri } from '@/desktop-app/tauri'
import ConnectorsPanel from './ConnectorsPanel.vue'
import Icon from './Icon.vue'
import { useSettingsI18n, type SettingsPageId } from './i18n'
import { captureShortcut, DEFAULT_PTT, isMacPlatform, shortcutCaps } from './shortcut'
import './theme.css'
import heroImg from './assets/hero.webp'
import sdAbout from './assets/sd-about.webp'
import sdCard from './assets/sd-card.webp'
import sdConnectors from './assets/sd-connectors.webp'
import sdGeneral from './assets/sd-general.webp'
import sdPermissions from './assets/sd-permissions.webp'
import sdVoice from './assets/sd-voice.webp'

type PageId = 'index' | SettingsPageId

// Index menu: each entry gets the Yui or Yumi SD sticker from the landing page that fits it.
const PAGES: { id: SettingsPageId, icon: string, sd: string }[] = [
  { id: 'card', icon: 'card', sd: sdCard },
  { id: 'general', icon: 'settings', sd: sdGeneral },
  { id: 'voice', icon: 'mic', sd: sdVoice },
  { id: 'permissions', icon: 'shield', sd: sdPermissions },
  { id: 'connectors', icon: 'plug', sd: sdConnectors },
  { id: 'about', icon: 'info', sd: sdAbout },
]

const settings = useSettings()
const character = useCharacterStore()
const persona = usePersona()
const { t, bcp47 } = useSettingsI18n(() => settings.lang)

const page = ref<PageId>('index')
const current = computed(() => (page.value === 'index' ? null : t.value.pages[page.value]))
const scroller = ref<HTMLElement | null>(null)

function go(id: PageId) {
  stopRecording()
  page.value = id
  scroller.value?.scrollTo({ top: 0 })
}

// --- Agent project folder (desktop app only: the web demo has no real files)

const desktopApp = inTauri()

async function pickProjectDir() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({ directory: true, multiple: false, defaultPath: settings.agentProjectDir || undefined, title: t.value.general.agentProject })
  if (typeof dir === 'string' && dir) settings.agentProjectDir = dir
}

// --- Character card

const MODEL_IDS = Object.keys(CHARACTER_MODELS) as CharacterId[]
const editing = computed(() => persona.activeCard)

type CardFieldKey = keyof Omit<PersonaCard, 'id' | 'builtinFor' | 'name'>
const CARD_FIELDS: { key: CardFieldKey, rows: number, max: number }[] = [
  { key: 'description', rows: 2, max: 600 },
  { key: 'personality', rows: 3, max: 800 },
  { key: 'scenario', rows: 2, max: 600 },
  { key: 'systemPrompt', rows: 4, max: 1800 },
  { key: 'speakingStyle', rows: 2, max: 400 },
]

function setField(key: keyof Omit<PersonaCard, 'id' | 'builtinFor'>, value: string) {
  persona.update(editing.value.id, { [key]: value })
}

function cardInitial(c: PersonaCard) {
  return (c.name.trim()[0] ?? '?').toUpperCase()
}

// --- General

const MODES: AssistantMode[] = ['active', 'quiet', 'ornamental']

// --- Voice: push-to-talk shortcut recorder

const mac = isMacPlatform()
const modKey = mac ? 'Cmd' : 'Win'
const pttCaps = computed(() => shortcutCaps(settings.pttKey, mac))
const recording = ref(false)
const recordError = ref(false)

/** Capture-phase window listener so the next key goes here, not to push-to-talk. */
function onRecordKey(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.type !== 'keydown' || e.repeat) return
  const res = captureShortcut(e)
  if (res.kind === 'wait') return
  if (res.kind === 'reject') { recordError.value = true; return }
  if (res.kind === 'ok') settings.pttKey = res.shortcut
  recordError.value = false
  stopRecording()
}

function startRecording() {
  if (recording.value) { recordError.value = false; stopRecording(); return }
  recording.value = true
  recordError.value = false
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
  recordError.value = false
  settings.pttKey = { ...DEFAULT_PTT }
}

onBeforeUnmount(stopRecording)

// --- About: open source notices (names and licenses stay as published)

const NOTICES: string[] = [
  '<b>AIRI</b> (moeru-ai/airi) — MIT.',
  '<b>Ayagami</b> — MIT OR Apache-2.0.',
  '<b>cubism-web-batched-renderer</b> — Live2D Open Software License. <b>pixi.js</b>, <b>pixi-live2d-display</b> — MIT.',
  '<b>Vue</b>, <b>Vite</b>, <b>Pinia</b>, <b>zod</b>, <b>modern-screenshot</b>, <b>jszip</b> — MIT.',
  '<b>@ricky0123/vad-web</b> (ISC), <b>Silero VAD</b>, <b>onnxruntime-web</b>, <b>wLipSync</b> — MIT.',
  '<b>Anthropic SDK</b> (Apache-2.0), <b>Deepgram SDK</b>, <b>ElevenLabs SDK</b> (MIT).',
]
</script>

<template>
  <div class="yy-airi settings-app" :lang="bcp47">
    <div ref="scroller" class="content scroll">
      <div class="inner">
        <!-- Page header (AIRI PageHeader): back arrow, small subtitle above a large title -->
        <header v-if="current" class="page-header">
          <button type="button" class="back" :aria-label="t.back" @click="go('index')">
            <Icon name="chevron-left" :size="26" />
          </button>
          <h1>
            <span class="subtitle">{{ t.settings }}</span>
            <span class="title">{{ current.title }}</span>
          </h1>
        </header>

        <!-- Index: landing-style hero with Yui and Yumi, then SD menu cards -->
        <template v-if="page === 'index'">
          <section class="hero" :style="{ backgroundImage: `url(${heroImg})` }">
            <div class="hero-text">
              <span class="brand">YuiYumi</span>
              <h1>{{ t.settings }}</h1>
              <p>{{ t.about.tagline }}</p>
            </div>
          </section>

          <div class="menu">
            <button
              v-for="(p, i) in PAGES" :key="p.id" type="button"
              class="menu-sd-item" :style="{ animationDelay: `${i * 50}ms` }"
              @click="go(p.id)"
            >
              <span class="mi-text">
                <span class="mi-chip"><Icon :name="p.icon" :size="16" /></span>
                <span class="mi-title">{{ t.pages[p.id].title }}</span>
                <span class="mi-desc">{{ t.pages[p.id].desc }}</span>
              </span>
              <img class="mi-sd" :src="p.sd" alt="" draggable="false">
            </button>
          </div>
        </template>

      <!-- Character card (AIRI airi-card) -->
      <template v-if="page === 'card'">
        <section class="section">
          <h2>{{ t.card.model }}</h2>
          <p class="hint">{{ t.card.modelHint }}</p>
          <div class="radio-grid">
            <button
              v-for="id in MODEL_IDS" :key="id" type="button"
              class="radio-card model-card" :class="{ active: character.character === id }"
              @click="character.setCharacter(id)"
            >
              <img :src="CHARACTER_MODELS[id].icon" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'">
              <b>{{ CHARACTER_MODELS[id].label }}</b>
              <span>{{ character.character === id ? t.card.inUse : t.card.switchTo }}</span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="sec-head">
            <div>
              <h2>{{ t.card.cards }}</h2>
              <p class="hint">{{ t.card.cardsHint(CHARACTER_MODELS[character.character].label) }}</p>
            </div>
            <div class="actions">
              <button type="button" class="btn" @click="persona.create()"><Icon name="plus" :size="15" />{{ t.card.newCard }}</button>
              <button type="button" class="btn" @click="persona.create(editing)"><Icon name="copy" :size="15" />{{ t.card.duplicate }}</button>
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
                  <b>{{ c.name || t.card.untitled }}</b>
                  <span v-if="persona.activeCard.id === c.id" class="cc-check"><Icon name="check" :size="14" /></span>
                </span>
                <span class="cc-desc">{{ c.description || t.card.noDescription }}</span>
                <span class="cc-stats">{{ c.builtinFor ? t.card.defaultFor(CHARACTER_MODELS[c.builtinFor].label) : t.card.custom }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="sec-head">
            <div>
              <h2>{{ t.card.edit(editing.name || t.card.untitled) }}</h2>
              <p class="hint">{{ t.card.editHint }}</p>
            </div>
            <div class="actions">
              <button v-if="editing.builtinFor" type="button" class="btn" @click="persona.resetToDefault(editing.id)"><Icon name="reset" :size="15" />{{ t.card.resetDefault }}</button>
              <button v-else type="button" class="btn danger" @click="persona.remove(editing.id)"><Icon name="trash" :size="15" />{{ t.card.remove }}</button>
            </div>
          </div>
          <div class="field">
            <label>{{ t.card.name }} <span class="sub">— {{ t.card.nameSub }}</span></label>
            <input type="text" maxlength="40" :value="editing.name" @input="setField('name', ($event.target as HTMLInputElement).value)">
          </div>
          <div v-for="f in CARD_FIELDS" :key="f.key" class="field">
            <label>{{ t.card.fields[f.key].label }} <span class="sub">— {{ t.card.fields[f.key].sub }}</span></label>
            <textarea :rows="f.rows" :maxlength="f.max" :value="editing[f.key]" @input="setField(f.key, ($event.target as HTMLTextAreaElement).value)" />
          </div>
        </section>
      </template>

      <!-- General -->
      <template v-else-if="page === 'general'">
        <section class="section">
          <h2>{{ t.general.userName }}</h2>
          <p class="hint">{{ t.general.userNameHint }}</p>
          <div class="field">
            <input
              type="text" :maxlength="USER_NAME_MAX" :value="settings.userName" :placeholder="t.general.userNamePlaceholder"
              :aria-label="t.general.userName" @input="settings.userName = ($event.target as HTMLInputElement).value"
            >
          </div>
        </section>
        <section class="section">
          <h2>{{ t.general.language }}</h2>
          <p class="hint">{{ t.general.languageHint }}</p>
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
          <h2>{{ t.general.mode }}</h2>
          <p class="hint">{{ t.general.modeHint }}</p>
          <div class="radio-grid">
            <button
              v-for="m in MODES" :key="m" type="button"
              class="radio-card" :class="{ active: settings.mode === m }"
              @click="settings.mode = m"
            >
              <b>{{ t.general.modes[m].title }}</b><span>{{ t.general.modes[m].desc }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <h2>{{ t.general.agentModel }}</h2>
          <p class="hint">{{ t.general.agentModelHint }}</p>
          <div class="radio-grid">
            <button
              v-for="m in AGENT_MODELS" :key="m" type="button"
              class="radio-card" :class="{ active: settings.agentModel === m }"
              @click="settings.agentModel = m"
            >
              <b>{{ t.general.agentModels[m].title }}</b><span>{{ t.general.agentModels[m].desc }}</span>
            </button>
          </div>
        </section>
        <section v-if="desktopApp" class="section">
          <h2>{{ t.general.agentProject }}</h2>
          <p class="hint">{{ t.general.agentProjectHint }}</p>
          <div class="row">
            <div class="txt"><b class="path" :title="settings.agentProjectDir">{{ settings.agentProjectDir || t.general.agentProjectNone }}</b></div>
            <div class="row-actions">
              <button v-if="settings.agentProjectDir" type="button" class="btn" @click="settings.agentProjectDir = ''">{{ t.general.agentProjectClear }}</button>
              <button type="button" class="btn primary" @click="pickProjectDir">{{ t.general.agentProjectPick }}</button>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="row">
            <div class="txt"><b>{{ t.general.sound }}</b><span>{{ t.general.soundDesc }}</span></div>
            <button type="button" class="switch" :class="{ on: settings.sound }" :aria-pressed="settings.sound" :aria-label="t.general.sound" @click="settings.sound = !settings.sound" />
          </div>
        </section>
      </template>

      <!-- Voice -->
      <template v-else-if="page === 'voice'">
        <section class="section">
          <h2>{{ t.voice.voiceLang }}</h2>
          <p class="hint">{{ t.voice.voiceLangHint }}</p>
          <div class="radio-grid">
            <button
              type="button" class="radio-card" :class="{ active: settings.voiceLang === null }"
              @click="settings.voiceLang = null"
            >
              <b>{{ t.voice.followUi(LANG_INFO[settings.lang].label) }}</b><span>auto</span>
            </button>
            <button
              v-for="l in LANGS" :key="l" type="button"
              class="radio-card" :class="{ active: settings.voiceLang === l }"
              @click="settings.voiceLang = l"
            >
              <b>{{ LANG_INFO[l].label }}</b><span>{{ l }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <h2>{{ t.voice.ptt }}</h2>
          <p class="hint">{{ t.voice.pttHint(modKey) }}</p>
          <div class="row">
            <div class="txt">
              <b>{{ t.voice.pttDefault }}</b>
              <span>{{ recording ? t.voice.pttRecording : t.voice.pttIdle }}</span>
            </div>
            <div class="ptt-right">
              <span class="caps" :class="{ armed: recording }" aria-live="polite">
                <template v-if="recording"><kbd class="cap wait">…</kbd></template>
                <kbd v-for="(k, i) in pttCaps" v-else :key="i" class="cap">{{ k }}</kbd>
              </span>
              <button type="button" class="btn" :class="{ primary: recording }" @click="startRecording">
                <Icon name="keyboard" :size="15" />{{ recording ? t.voice.cancel : t.voice.record }}
              </button>
              <button type="button" class="btn" :disabled="!recording && settings.pttKey.code === 'Space' && pttCaps.length === 1" @click="resetPtt">
                <Icon name="reset" :size="15" />Space
              </button>
            </div>
          </div>
          <p v-if="recordError" class="error">{{ t.voice.keyReject(modKey) }}</p>
        </section>
        <section class="section">
          <h2>{{ t.voice.style }}</h2>
          <p class="hint">{{ t.voice.styleHint }}</p>
          <div class="radio-grid">
            <button
              v-for="v in VOICE_PRESETS" :key="v" type="button" class="radio-card"
              :class="{ active: settings.voicePreset === v }" @click="settings.voicePreset = v"
            >
              <b>{{ t.voice.styles[v].title }}</b><span>{{ t.voice.styles[v].desc }}</span>
            </button>
          </div>
        </section>
        <section class="section">
          <h2>{{ t.voice.vad }}</h2>
          <p class="hint">{{ t.voice.vadHint }}</p>
          <div class="row">
            <div class="txt">
              <b>{{ t.voice.vadName }}</b>
              <span>{{ voiceState.vadLoading ? t.voice.vadLoading : voiceState.vadEnabled ? t.voice.vadOn : t.voice.off }}</span>
            </div>
            <button
              type="button" class="switch" :class="{ on: voiceState.vadEnabled }" :aria-pressed="voiceState.vadEnabled"
              :aria-label="t.voice.vadName" :disabled="voiceState.vadLoading"
              @click="setVadEnabled(!voiceState.vadEnabled)"
            />
          </div>
          <p v-if="voiceState.error" class="error">{{ voiceState.error }}</p>
        </section>
      </template>

      <!-- Permissions -->
      <template v-else-if="page === 'permissions'">
        <section class="section">
          <p class="hint">{{ t.permissions.hint }}</p>
          <div class="radio-grid">
            <button
              v-for="lv in PERMISSION_LEVELS" :key="lv" type="button" class="radio-card"
              :class="{ active: settings.permission === lv, danger: lv === 'bypass' }" @click="settings.permission = lv"
            >
              <b>{{ t.permissions.levels[lv].title }}</b><span>{{ t.permissions.levels[lv].desc }}</span>
            </button>
          </div>
          <p v-if="settings.permission === 'bypass'" class="warn">{{ t.permissions.bypassWarn }}</p>
        </section>
      </template>

      <!-- Connectors -->
      <template v-else-if="page === 'connectors'">
        <ConnectorsPanel />
      </template>

      <!-- About -->
      <template v-else-if="page === 'about'">
        <section class="section">
          <h2>YuiYumi</h2>
          <p class="hint">{{ t.about.tagline }}</p>
        </section>
        <section class="section">
          <h2>{{ t.about.notices }}</h2>
          <p class="hint">{{ t.about.noticesHint }}</p>
          <ul class="notices">
            <!-- eslint-disable-next-line vue/no-v-html -- static notice markup defined above -->
            <li v-for="(n, i) in NOTICES" :key="i"><span v-html="n" /> {{ t.about.items[i] }}</li>
            <li>{{ t.about.notRedistributed }}</li>
          </ul>
        </section>
      </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Landing page palette (sakura pink, plum text) in place of AIRI's cyan. */
.settings-app {
  --p50: #fdf0f4; --p100: #fce3ea; --p200: #fac8d7; --p300: #f8b7cb; --p400: #e78ca8; --p500: #e0567e; --p600: #c2416a;
  --ink: #3e2f38; --ink-soft: #5a4652;
  display: block; background: #fff; color: var(--ink);
}
.content { height: 100%; }
.inner { max-width: 1280px; margin: 0 auto; padding: 0 16px 48px; display: flex; flex-direction: column; }

.page-header {
  position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px;
  padding: 36px 0 24px; background: #fff;
}
.back { display: grid; place-items: center; border: 0; padding: 0; background: none; color: var(--ink); cursor: pointer; }
.page-header h1 { position: relative; margin: 0; font-weight: 400; }
.page-header .subtitle { position: absolute; left: 0; top: 0; transform: translateY(-80%); font-size: 15px; color: var(--p400); white-space: nowrap; }
.page-header .title { display: block; font-size: 30px; line-height: 1.2; color: var(--ink); white-space: nowrap; }

/* Hero: the landing page's duo room art, faded to white on the left behind the text. */
.hero {
  position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center;
  min-height: 240px; margin: 24px 0 20px; padding: 28px 32px; border-radius: 20px;
  background-color: #fff; background-repeat: no-repeat; background-size: max(78%, 420px) auto; background-position: right 28%;
  box-shadow: 0 10px 30px rgb(224 86 126 / .12); animation: mi-enter .35s ease-out both;
}
.hero::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(90deg, #fff 0%, #fff 25%, rgb(255 255 255 / .9) 34%, rgb(255 255 255 / .45) 46%, rgb(255 255 255 / 0) 58%);
}
.hero-text { max-width: 46%; display: flex; flex-direction: column; gap: 6px; }
.brand {
  align-self: flex-start; padding: 3px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; letter-spacing: .02em;
  color: var(--p500); background: var(--p100);
}
.hero h1 { margin: 2px 0 0; font-size: 34px; line-height: 1.15; font-weight: 700; color: var(--ink); }
.hero p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink-soft); }

/* Menu: two-column cards with an SD sticker peeking in from the right. */
.menu { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.menu-sd-item {
  position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; width: 100%; min-height: 128px;
  padding: 18px 20px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: linear-gradient(135deg, #fff 40%, var(--p50)); border: 2px solid var(--p100); border-radius: 16px;
  transition: border-color .3s, box-shadow .3s, transform .3s; animation: mi-enter .25s ease-out both;
}
.menu-sd-item::after {
  content: ''; position: absolute; right: -24px; bottom: -40px; z-index: -1; width: 170px; height: 170px; border-radius: 50%;
  background: radial-gradient(circle, var(--p100) 0%, rgb(252 227 234 / 0) 70%); transition: transform .3s;
}
.menu-sd-item:hover { border-color: var(--p300); box-shadow: 0 8px 22px rgb(224 86 126 / .15); transform: translateY(-2px); }
.menu-sd-item:hover::after { transform: scale(1.15); }
.menu-sd-item:active { transform: none; box-shadow: none; }
.menu-sd-item:focus-visible { outline: 3px solid var(--p300); outline-offset: 2px; }
.mi-text { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 110px; }
.mi-chip { display: grid; place-items: center; width: 30px; height: 30px; margin-bottom: 6px; border-radius: 9px; color: var(--p500); background: var(--p100); }
.mi-title { font-size: 18px; font-weight: 700; color: var(--ink); transition: color .3s; }
.mi-desc { font-size: 13.5px; color: var(--ink-soft); opacity: .85; }
.menu-sd-item:hover .mi-title { color: var(--p600); }
.mi-sd {
  position: absolute; right: 8px; bottom: -6px; width: 118px; height: 118px; object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 4px 6px rgb(62 47 56 / .12)); transform-origin: 50% 100%; transition: transform .35s cubic-bezier(.34, 1.56, .64, 1);
}
.menu-sd-item:hover .mi-sd { transform: translateY(-6px) rotate(-4deg) scale(1.06); }
@keyframes mi-enter { from { opacity: 0; transform: translateY(10px); } }

@media (max-width: 760px) {
  .menu { grid-template-columns: 1fr; }
  .hero { min-height: 200px; padding: 22px; background-size: 66% auto; background-position: right 30%; }
  .hero::before { background: linear-gradient(90deg, #fff 0%, #fff 36%, rgb(255 255 255 / .8) 44%, rgb(255 255 255 / 0) 60%); }
  .hero-text { max-width: 50%; }
  .hero p { font-size: 13px; }
  .hero h1 { font-size: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero, .menu-sd-item { animation: none; }
  .menu-sd-item, .menu-sd-item::after, .mi-sd { transition: none; }
  .menu-sd-item:hover, .menu-sd-item:hover .mi-sd { transform: none; }
}

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
  background: linear-gradient(90deg, rgb(224 86 126 / .14), rgb(224 86 126 / .06), transparent); transition: all .4s ease-in-out;
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
.char-card:hover .cc-body { color: var(--p600); }
.char-card:hover .cc-body::after { background-image: radial-gradient(circle, rgb(248 183 203 / .6) 1px, transparent 1px); }
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
.radio-card.danger.active { border-color: #f87171; background: #fef2f2; }
.row .txt b.path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 400; font-size: 12.5px; word-break: break-all; }
.row-actions { display: flex; flex: none; gap: 8px; }
.warn { margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 13px; }
</style>
