<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDemo } from '@/stores/demo'
import { stage } from '../actuator'
import { useAssistantMarks } from '../assistant-strings'
import { colorFor, initials, timeLabel } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'

const demo = useDemo()
const marks = useAssistantMarks()
const channelId = ref('sl-orbit')
/** Text the assistant is typing into this app's composer. */
const agentTyping = computed(() => (stage.typing?.app === 'slack' ? stage.typing : null))
// Follow the assistant: the channel it types into or just posted to.
watch(() => agentTyping.value?.channelId, (id) => { if (id) channelId.value = id })
watch(() => stage.reveal?.seq, () => {
  const r = stage.reveal
  if (r?.app === 'slack' && typeof r.input.channelId === 'string') channelId.value = r.input.channelId
})
const { locale } = useDesktopStrings()

const channel = computed(() => demo.slackChannels.find(c => c.id === channelId.value) ?? demo.slackChannels[0] ?? null)
const messages = computed(() =>
  demo.slackMessages.filter(m => m.channelId === channel.value?.id).sort((a, b) => a.at.localeCompare(b.at)))
const draft = computed({
  get: () => (channel.value ? demo.slackDrafts[channel.value.id] ?? '' : ''),
  set: v => { if (channel.value) demo.setSlackDraft(channel.value.id, v) },
})

/** Direct-message list: the two most recent distinct authors in the workspace. */
const dmNames = computed(() => [...new Set([...demo.slackMessages].sort((a, b) => b.at.localeCompare(a.at)).map(m => m.author))].slice(0, 2))

// Jump to the channel that just received a draft from the agent.
watch(() => demo.slackDrafts, (next, prev) => {
  const changed = Object.keys(next).find(k => next[k] && next[k] !== prev?.[k])
  if (changed && changed !== channelId.value && document.activeElement?.tagName !== 'TEXTAREA') channelId.value = changed
})

watch(channel, c => setWindowTitle('slack', c ? `Slack — #${c.name} (${c.workspace})` : 'Slack'), { immediate: true })
</script>

<template>
  <div class="slack">
    <aside class="side">
      <div class="ws">{{ channel?.workspace ?? 'Workspace' }}</div>
      <div class="section">Channels</div>
      <button
        v-for="c in demo.slackChannels"
        :key="c.id"
        class="ch"
        :class="{ on: c.id === channel?.id }"
        @click="channelId = c.id"
      >
        # {{ c.name }}<span v-if="demo.slackDrafts[c.id]" class="pen">draft</span>
      </button>
      <div class="section">Direct messages</div>
      <div v-for="name in dmNames" :key="name" class="dm"><span class="presence" /> {{ name }}</div>
    </aside>
    <main class="main">
      <div class="head"># {{ channel?.name }}</div>
      <div class="msgs">
        <div v-for="m in messages" :key="m.id" class="msg">
          <span class="avatar" :style="{ background: colorFor(m.author) }">{{ initials(m.author) }}</span>
          <div>
            <div><strong>{{ m.author }}</strong> <span class="time">{{ timeLabel(m.at, undefined, locale) }}</span></div>
            <div class="text">{{ m.text }}</div>
            <div v-if="m.viaAssistant" class="via">{{ marks.via }}</div>
          </div>
        </div>
      </div>
      <div v-if="agentTyping" class="composer agent">
        <div class="agent-note">{{ marks.typing }}</div>
        <div class="agent-text">{{ agentTyping.text }}<i class="caret" /></div>
      </div>
      <div v-else class="composer" :class="{ has: draft }">
        <div v-if="draft" class="draft-note">Draft — not sent</div>
        <textarea v-model="draft" :placeholder="`Message #${channel?.name ?? ''}`" spellcheck="false" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.slack { display: flex; height: 100%; font-size: 19px; }
.side { width: 270px; flex: 0 0 270px; background: #3f0e40; color: #e9d7ea; padding: 14px 10px; display: flex; flex-direction: column; gap: 2px; }
.ws { font-size: 22px; font-weight: 800; color: #fff; padding: 4px 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.15); margin-bottom: 10px; }
.section { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; padding: 12px 10px 4px; }
.ch { display: flex; justify-content: space-between; align-items: center; border: none; background: none; color: inherit; text-align: left; font-size: 19px; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-family: inherit; }
.ch.on { background: #1164a3; color: #fff; font-weight: 600; }
.pen { font-size: 13px; background: rgba(255,255,255,0.2); border-radius: 6px; padding: 0 6px; }
.dm { padding: 6px 10px; display: flex; align-items: center; gap: 8px; }
.presence { width: 10px; height: 10px; border-radius: 50%; background: #2bac76; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.head { font-size: 22px; font-weight: 800; padding: 14px 22px; border-bottom: 1px solid #e5e7eb; }
.msgs { flex: 1; overflow: hidden; padding: 12px 22px; display: flex; flex-direction: column; gap: 16px; justify-content: flex-end; }
.msg { display: flex; gap: 12px; }
.avatar { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 10px; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
.time { color: #6b7280; font-size: 15px; margin-left: 6px; }
.text { font-size: 19px; line-height: 1.5; color: #1f2937; }
.composer { margin: 0 22px 20px; border: 1px solid #c4c7cc; border-radius: 12px; overflow: hidden; }
.composer.has { border-color: #e0a100; box-shadow: 0 0 0 2px #fde68a; }
.draft-note { background: #fef3c7; color: #92400e; font-size: 15px; font-weight: 700; padding: 4px 12px; }
.composer textarea { width: 100%; height: 96px; border: none; outline: none; resize: none; padding: 10px 14px; font-family: inherit; font-size: 19px; box-sizing: border-box; }
.via { font-size: 13px; color: #c2185b; font-weight: 600; margin-top: 2px; }
.composer.agent { border-color: #e2456f; box-shadow: 0 0 0 2px rgba(226, 69, 111, 0.25); }
.agent-note { background: #fde7ef; color: #a1134a; font-size: 15px; font-weight: 700; padding: 4px 12px; }
.agent-text { min-height: 96px; padding: 10px 14px; font-size: 19px; line-height: 1.5; white-space: pre-wrap; box-sizing: border-box; }
.caret { display: inline-block; width: 2px; height: 1.1em; margin-left: 1px; vertical-align: text-bottom; background: #e2456f; animation: caret-blink 0.9s steps(1) infinite; }
@keyframes caret-blink { 50% { opacity: 0; } }
</style>
