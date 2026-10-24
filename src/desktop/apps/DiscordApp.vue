<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDemo } from '@/stores/demo'
import { colorFor, initials, timeLabel } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'

const demo = useDemo()
const { locale } = useDesktopStrings()
const channelId = ref('dc-lounge')
/** Local composer text only; there is no send action. */
const composer = ref<Record<string, string>>({})

const channel = computed(() => demo.discordChannels.find(c => c.id === channelId.value) ?? demo.discordChannels[0] ?? null)
const messages = computed(() =>
  demo.discordMessages.filter(m => m.channelId === channel.value?.id).sort((a, b) => a.at.localeCompare(b.at)))
const text = computed({
  get: () => (channel.value ? composer.value[channel.value.id] ?? '' : ''),
  set: v => { if (channel.value) composer.value = { ...composer.value, [channel.value.id]: v } },
})

watch(channel, c => setWindowTitle('discord', c ? `Discord — #${c.name} | ${c.workspace}` : 'Discord'), { immediate: true })
</script>

<template>
  <div class="dc">
    <div class="servers">
      <span class="srv on">IM</span>
      <span class="srv">+</span>
    </div>
    <aside class="side">
      <div class="srv-name">{{ channel?.workspace ?? 'Server' }}</div>
      <div class="section">Text channels</div>
      <button
        v-for="c in demo.discordChannels"
        :key="c.id"
        class="ch"
        :class="{ on: c.id === channel?.id }"
        @click="channelId = c.id"
      ># {{ c.name }}</button>
    </aside>
    <main class="main">
      <div class="head"># {{ channel?.name }}</div>
      <div class="msgs">
        <div v-for="m in messages" :key="m.id" class="msg">
          <span class="avatar" :style="{ background: colorFor(m.author) }">{{ initials(m.author) }}</span>
          <div>
            <div><strong :style="{ color: colorFor(m.author) }">{{ m.author }}</strong> <span class="time">{{ timeLabel(m.at, undefined, locale) }}</span></div>
            <div class="text">{{ m.text }}</div>
          </div>
        </div>
      </div>
      <div class="composer">
        <textarea v-model="text" :placeholder="`Message #${channel?.name ?? ''}`" spellcheck="false" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.dc { display: flex; height: 100%; font-size: 19px; background: #313338; color: #dbdee1; }
.servers { width: 76px; flex: 0 0 76px; background: #1e1f22; display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 12px; }
.srv { width: 50px; height: 50px; border-radius: 50%; background: #313338; color: #dbdee1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
.srv.on { background: #5865f2; color: #fff; border-radius: 16px; }
.side { width: 250px; flex: 0 0 250px; background: #2b2d31; padding: 0 8px; }
.srv-name { font-weight: 800; color: #f2f3f5; font-size: 19px; padding: 16px 8px; border-bottom: 1px solid #1f2023; margin-bottom: 8px; }
.section { font-size: 14px; text-transform: uppercase; color: #949ba4; font-weight: 700; padding: 10px 8px 4px; }
.ch { display: block; width: 100%; border: none; background: none; color: #949ba4; text-align: left; font-size: 19px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; }
.ch.on { background: #404249; color: #f2f3f5; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.head { font-size: 20px; font-weight: 800; color: #f2f3f5; padding: 14px 20px; border-bottom: 1px solid #26272b; }
.msgs { flex: 1; overflow: hidden; padding: 12px 20px; display: flex; flex-direction: column; gap: 16px; justify-content: flex-end; }
.msg { display: flex; gap: 14px; }
.avatar { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.time { color: #949ba4; font-size: 14px; margin-left: 6px; }
.text { font-size: 19px; line-height: 1.5; color: #dbdee1; }
.composer { margin: 0 20px 20px; background: #383a40; border-radius: 10px; }
.composer textarea { width: 100%; height: 64px; border: none; outline: none; resize: none; background: transparent; color: #dbdee1; padding: 12px 16px; font-family: inherit; font-size: 19px; box-sizing: border-box; }
</style>
