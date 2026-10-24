<script setup lang="ts">
// Dashboard window: read-only live view of the companion. Every tile reads real session
// state (nunchi status, bus activity, demo store, voice state). Look adapted from AIRI (MIT).

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ConnectorService, DialogueTurn } from '@shared/contracts'
import { CHARACTER_MODELS } from '@/character/models'
import { useCharacterStore } from '@/character/store'
import { LIVE_SERVICES } from '@/connectors/registry'
import { nunchiStatus, recentDialogue } from '@/nunchi'
import { nunchiConfig } from '@/nunchi/config'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { voiceState } from '@/voice'
import { activity } from './activity'
import Icon from './Icon.vue'
import { useSettingsI18n } from './i18n'
import { formatShortcut, isMacPlatform } from './shortcut'
import './theme.css'

const settings = useSettings()
const character = useCharacterStore()
const persona = usePersona()
const demo = useDemo()
const { t, bcp47 } = useSettingsI18n(() => settings.lang)

// Clock for relative times; also refreshes the dialogue copy (DialogueLog is not reactive).
const now = ref(Date.now())
const dialogue = ref<DialogueTurn[]>([])
function refresh() {
  now.value = Date.now()
  dialogue.value = recentDialogue()
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { refresh(); timer = setInterval(refresh, 1500) })
onBeforeUnmount(() => clearInterval(timer))
watch(() => activity.dialogueTick, () => setTimeout(refresh, 50))

const decision = computed(() => t.value.dash.decisions[nunchiStatus.last] ?? nunchiStatus.last)

function ago(at: number | undefined | null): string {
  if (!at) return ''
  const s = Math.max(0, Math.round((now.value - at) / 1000))
  return t.value.dash.ago(s)
}

const slackDraftCount = computed(() => Object.values(demo.slackDrafts).filter(t => t.trim()).length)
const draftsSaved = computed(() => demo.drafts.length + slackDraftCount.value)
const quotaPct = computed(() => nunchiConfig.maxPerDay > 0
  ? Math.min(100, Math.round(nunchiStatus.interjectionsToday / nunchiConfig.maxPerDay * 100))
  : 100)

const pttLabel = computed(() => formatShortcut(settings.pttKey, isMacPlatform()))

const SERVICES: { id: Exclude<ConnectorService, 'reminders'>, title: string, icon: string, n: () => number }[] = [
  { id: 'mail', title: 'Gmail', icon: 'mail', n: () => demo.mails.length },
  { id: 'calendar', title: 'Calendar', icon: 'calendar', n: () => demo.events.length },
  { id: 'drive', title: 'Drive', icon: 'drive', n: () => demo.files.length },
  { id: 'slack', title: 'Slack', icon: 'slack', n: () => demo.slackChannels.length },
  { id: 'discord', title: 'Discord', icon: 'discord', n: () => demo.discordChannels.length },
]
// LIVE_SERVICES is a plain object; re-read it on the clock tick.
const liveFlags = computed(() => { void now.value; return { ...LIVE_SERVICES } })
</script>

<template>
  <div class="yy-airi dash scroll" :lang="bcp47">
    <div class="dash-inner">
      <!-- Page header (AIRI PageHeader): small subtitle above a large title -->
      <header class="page-header">
        <h1>
          <span class="subtitle">YuiYumi</span>
          <span class="title">{{ t.dash.title }}</span>
        </h1>
      </header>

      <!-- Stat tiles -->
      <div class="tiles">
        <div class="tile">
          <div class="t-icon"><Icon name="spark" :size="64" /></div>
          <span class="t-label">{{ t.dash.interjections }}</span>
          <span class="t-value">{{ nunchiStatus.interjectionsToday }}<small> / {{ nunchiConfig.maxPerDay }}</small></span>
          <div class="meter"><div :style="{ width: `${quotaPct}%` }" /></div>
        </div>
        <div class="tile">
          <div class="t-icon"><Icon name="eye" :size="64" /></div>
          <span class="t-label">{{ t.dash.lastDecision }}</span>
          <span class="t-value small">{{ decision }}</span>
          <span class="t-sub">{{ nunchiStatus.inFlight ? t.dash.checking : ago(activity.lastDecision?.at) || t.dash.noCheck }} · {{ t.dash.dwell(Math.round(nunchiStatus.dwellSec)) }}</span>
        </div>
        <div class="tile">
          <div class="t-icon"><Icon name="dashboard" :size="64" /></div>
          <span class="t-label">{{ t.dash.tasksRun }}</span>
          <span class="t-value">{{ activity.tasksRun }}</span>
          <span class="t-sub">{{ t.dash.fromScreen(activity.tasksFromScreen) }}</span>
        </div>
        <div class="tile">
          <div class="t-icon"><Icon name="draft" :size="64" /></div>
          <span class="t-label">{{ t.dash.drafts }}</span>
          <span class="t-value">{{ draftsSaved }}</span>
          <span class="t-sub">{{ t.dash.draftsBreakdown(demo.drafts.length, slackDraftCount) }}</span>
        </div>
      </div>

      <div class="cols">
        <!-- Recent dialogue -->
        <section class="section dialogue">
          <h2><Icon name="chat" :size="16" /> {{ t.dash.dialogue }}</h2>
          <div class="msgs scroll">
            <p v-if="!dialogue.length" class="empty">{{ t.dash.emptyDialogue(pttLabel) }}</p>
            <div v-for="(turn, i) in dialogue" :key="i" class="msg" :class="turn.role">
              <span class="who">{{ turn.role === 'user' ? (settings.userName.trim() || t.dash.you) : persona.activeCard.name }}</span>
              <span class="bubble">{{ turn.text }}</span>
            </div>
          </div>
        </section>

        <div class="side-col">
          <!-- Now -->
          <section class="section">
            <h2><Icon name="clock" :size="16" /> {{ t.dash.now }}</h2>
            <div class="kv"><span>{{ t.dash.mode }}</span><span class="badge" :class="settings.mode === 'active' ? 'primary' : 'mock'">{{ t.general.modes[settings.mode].title }}</span></div>
            <div class="kv"><span>{{ t.dash.model }}</span><b>{{ CHARACTER_MODELS[character.character].label }}</b></div>
            <div class="kv"><span>{{ t.dash.character }}</span><b>{{ persona.activeCard.name }}</b></div>
            <div class="kv"><span>{{ t.dash.voice }}</span><b>{{ voiceState.speaking ? t.dash.speaking : voiceState.vadEnabled ? t.dash.listeningVad : t.dash.ptt(pttLabel) }}</b></div>
            <div class="kv"><span>{{ t.dash.sound }}</span><b>{{ settings.sound ? t.dash.on : t.dash.off }}</b></div>
          </section>

          <!-- Connected services -->
          <section class="section">
            <h2><Icon name="plug" :size="16" /> {{ t.dash.services }}</h2>
            <div class="svc-grid">
              <div v-for="s in SERVICES" :key="s.id" class="svc">
                <Icon :name="s.icon" :size="18" />
                <span class="svc-name">{{ s.title }}</span>
                <span class="svc-count">{{ t.dash.counts[s.id](s.n()) }}</span>
                <span class="badge" :class="liveFlags[s.id] ? 'live' : 'mock'">{{ liveFlags[s.id] ? t.connectors.live : t.connectors.mock }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash { display: block; overflow-y: auto; background: #fff; }
.dash-inner { max-width: 1280px; margin: 0 auto; padding: 0 16px 24px; min-height: 100%; display: flex; flex-direction: column; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 36px 0 24px; }
.page-header h1 { position: relative; margin: 0; font-weight: 400; }
.page-header .subtitle { position: absolute; left: 0; top: 0; transform: translateY(-80%); font-size: 15px; color: var(--n300); white-space: nowrap; }
.page-header .title { display: block; font-size: 30px; line-height: 1.2; color: var(--n900); }

.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.tile {
  position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px;
  background: var(--n50); border: 2px solid var(--n100); border-radius: 8px; min-width: 0; isolation: isolate;
  transition: all .4s ease-in-out;
}
/* Dotted corner texture and hover glow of AIRI menu icon items. */
.tile::after {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background-image: radial-gradient(circle, rgb(229 229 229 / .6) 1px, transparent 1px); background-size: 10px 10px;
  mask-image: linear-gradient(165deg, white 30%, transparent 50%);
}
.tile:hover { border-color: rgb(34 169 210 / .3); filter: drop-shadow(0 4px 4px rgb(220 220 220 / .4)); }
.tile:hover .t-icon { color: rgb(34 169 210 / .35); scale: 1.1; }
.t-icon { transition: all .4s ease-in-out; position: absolute; right: -10px; bottom: -14px; color: rgb(163 163 163 / .22); pointer-events: none; }
.t-label { font-size: 12.5px; color: var(--n500); position: relative; }
.t-value { font-size: 28px; font-weight: 500; color: var(--n800); line-height: 1.15; position: relative; }
.t-value small { font-size: 15px; color: var(--n400); font-weight: 400; }
.t-value.small { font-size: 16px; line-height: 1.35; padding: 5px 0 3px; }
.t-sub { font-size: 12px; color: var(--n500); position: relative; }
.meter { height: 6px; border-radius: 999px; background: var(--n200); overflow: hidden; margin-top: 6px; position: relative; }
.meter > div { height: 100%; background: linear-gradient(90deg, var(--p300), var(--p500)); border-radius: inherit; transition: width .4s; }

.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; }
.section { margin-bottom: 0; }
.section h2 { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.side-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.dialogue { display: flex; flex-direction: column; min-height: 260px; }
.msgs { flex: 1; min-height: 0; max-height: 420px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.empty { color: var(--n400); font-size: 13px; margin: 8px 0; }
.msg { display: flex; flex-direction: column; gap: 2px; max-width: 88%; }
.msg.user { align-self: flex-end; align-items: flex-end; }
.who { font-size: 11px; color: var(--n400); }
.bubble { padding: 7px 11px; border-radius: 12px; font-size: 13px; background: #fff; border: 2px solid var(--n100); white-space: pre-wrap; word-break: break-word; }
.msg.user .bubble { background: var(--p500); border-color: var(--p500); color: #fff; }

.kv { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid var(--n100); font-size: 13px; }
.kv:first-of-type { border-top: 0; }
.kv > span:first-child { color: var(--n500); }
.kv b { font-weight: 500; }

.svc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.svc {
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; row-gap: 2px; align-items: center;
  padding: 9px 10px; border-radius: 10px; background: #fff; border: 2px solid var(--n100); color: var(--n600);
}
.svc-name { font-weight: 500; color: var(--n800); font-size: 13px; }
.svc-count { grid-column: 2; font-size: 11.5px; color: var(--n500); }
.svc .badge { grid-column: 1 / -1; justify-self: start; margin-top: 4px; }
</style>
