<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDemo, type Mail, type MailDraft } from '@/stores/demo'
import { colorFor, displayName, initials, timeLabel } from '../format'
import { setWindowTitle } from '../windows'

type Folder = 'inbox' | 'drafts' | 'spam'

const demo = useDemo()
const folder = ref<Folder>('inbox')
const selectedId = ref<string | null>('mail-jp-001')
const composing = ref(false)
const replyBody = ref('')

const inbox = computed(() => demo.mails.filter(m => !m.spam).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)))
const spam = computed(() => demo.mails.filter(m => m.spam))
const drafts = computed(() => [...demo.drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const unread = computed(() => inbox.value.filter(m => !m.read).length)

const list = computed<(Mail | MailDraft)[]>(() =>
  folder.value === 'inbox' ? inbox.value : folder.value === 'spam' ? spam.value : drafts.value)

const selectedMail = computed(() => demo.mails.find(m => m.id === selectedId.value) ?? null)
const selectedDraft = computed(() => demo.drafts.find(d => d.id === selectedId.value) ?? null)

function isMail(x: Mail | MailDraft): x is Mail {
  return 'from' in x
}

function open(id: string) {
  selectedId.value = id
  composing.value = false
  const m = demo.mails.find(x => x.id === id)
  if (m) m.read = true
}

function pickFolder(f: Folder) {
  folder.value = f
  composing.value = false
  selectedId.value = list.value[0]?.id ?? null
}

function startReply() {
  composing.value = true
  replyBody.value = ''
}

// Show newly saved drafts (written by the agent) right away.
watch(() => demo.drafts.length, (n, prev) => {
  if (n > (prev ?? 0)) {
    folder.value = 'drafts'
    composing.value = false
    selectedId.value = drafts.value[0]?.id ?? null
  }
})

watch(selectedMail, m => { if (m && !m.read) m.read = true }, { immediate: true })

const title = computed(() => {
  if (composing.value && selectedMail.value) return `Reply: ${selectedMail.value.subject}`
  if (folder.value === 'drafts') return selectedDraft.value ? `Draft: ${selectedDraft.value.subject}` : 'Drafts'
  if (selectedMail.value) return `${selectedMail.value.subject} — ${displayName(selectedMail.value.from)}`
  return folder.value === 'spam' ? 'Spam' : 'Inbox'
})
watch(title, t => setWindowTitle('mail', `Mail — ${t}`), { immediate: true })
</script>

<template>
  <div class="mail">
    <aside class="folders">
      <button class="compose" type="button" @click="selectedMail && startReply()">New Reply</button>
      <button :class="{ on: folder === 'inbox' }" @click="pickFolder('inbox')">
        <span>Inbox</span><b v-if="unread">{{ unread }}</b>
      </button>
      <button :class="{ on: folder === 'drafts' }" @click="pickFolder('drafts')">
        <span>Drafts</span><b v-if="drafts.length" class="muted">{{ drafts.length }}</b>
      </button>
      <button :class="{ on: folder === 'spam' }" @click="pickFolder('spam')">
        <span>Spam</span><b v-if="spam.length" class="muted">{{ spam.length }}</b>
      </button>
      <div class="account">alex.kim@aurora-lab.example</div>
    </aside>

    <div class="list">
      <div class="list-head">{{ folder === 'inbox' ? 'Inbox' : folder === 'drafts' ? 'Drafts' : 'Spam' }}</div>
      <div v-if="!list.length" class="empty">No messages</div>
      <button
        v-for="item in list"
        :key="item.id"
        class="row"
        :class="{ on: item.id === selectedId, unread: isMail(item) && !item.read }"
        @click="open(item.id)"
      >
        <template v-if="isMail(item)">
          <div class="row-top"><span class="from">{{ displayName(item.from) }}</span><span class="time">{{ timeLabel(item.receivedAt) }}</span></div>
          <div class="subject">{{ item.subject }}</div>
          <div class="snippet">{{ item.body.replace(/\s+/g, ' ').slice(0, 70) }}</div>
        </template>
        <template v-else>
          <div class="row-top"><span class="from draft-tag">Draft</span><span class="time">{{ timeLabel(item.createdAt) }}</span></div>
          <div class="subject">{{ item.subject }}</div>
          <div class="snippet">To: {{ item.to }}</div>
        </template>
      </button>
    </div>

    <main class="reader">
      <template v-if="folder === 'drafts' && selectedDraft">
        <div class="draft-banner">Draft saved — not sent. Review and send it yourself.</div>
        <h1>{{ selectedDraft.subject }}</h1>
        <div class="meta"><span class="label">To</span> {{ selectedDraft.to }}</div>
        <pre class="body">{{ selectedDraft.body }}</pre>
      </template>
      <template v-else-if="selectedMail">
        <h1>{{ selectedMail.subject }}</h1>
        <div class="sender">
          <span class="avatar" :style="{ background: colorFor(selectedMail.from) }">{{ initials(selectedMail.from) }}</span>
          <div>
            <div class="sender-name">{{ displayName(selectedMail.from) }}</div>
            <div class="meta">To: {{ selectedMail.to }} · {{ timeLabel(selectedMail.receivedAt) }}</div>
          </div>
          <button v-if="!composing" class="reply-btn" type="button" @click="startReply">Reply</button>
        </div>
        <div v-if="selectedMail.spam" class="spam-banner">This message looks like spam. Links and requests in it may be unsafe.</div>
        <pre class="body" :class="{ short: composing }">{{ selectedMail.body }}</pre>
        <div v-if="composing" class="composer">
          <div class="composer-head">Reply to {{ displayName(selectedMail.from) }} — Re: {{ selectedMail.subject }}</div>
          <textarea v-model="replyBody" placeholder="Write your reply..." spellcheck="false" />
          <div class="composer-foot">
            <span>Drafts are saved automatically. Sending is up to you.</span>
            <button type="button" class="ghost" @click="composing = false">Discard</button>
          </div>
        </div>
      </template>
      <div v-else class="empty">Select a message</div>
    </main>
  </div>
</template>

<style scoped>
.mail { display: flex; height: 100%; font-size: 19px; }
.folders { width: 180px; flex: 0 0 180px; background: #f3f5fa; border-right: 1px solid #e3e6ee; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
.folders button { display: flex; justify-content: space-between; align-items: center; border: none; background: none; padding: 10px 12px; border-radius: 10px; font-size: 19px; color: #1f2937; cursor: pointer; text-align: left; }
.folders button.on { background: #dfe8ff; color: #1e3a8a; font-weight: 600; }
.folders b { background: #1e6bff; color: #fff; border-radius: 999px; font-size: 15px; padding: 1px 9px; }
.folders b.muted { background: #c7cede; color: #1f2937; }
.folders .compose { justify-content: center; background: #1e6bff; color: #fff; font-weight: 600; margin-bottom: 10px; }
.account { margin-top: auto; font-size: 12px; color: #6b7280; padding: 0 6px; word-break: break-all; }
.list { width: 340px; flex: 0 0 340px; border-right: 1px solid #e3e6ee; overflow: hidden; display: flex; flex-direction: column; }
.list-head { padding: 14px 18px; font-size: 22px; font-weight: 700; border-bottom: 1px solid #eef0f4; }
.row { display: block; width: 100%; border: none; border-bottom: 1px solid #eef0f4; background: #fff; text-align: left; padding: 12px 18px; cursor: pointer; font-family: inherit; }
.row.on { background: #e8efff; }
.row-top { display: flex; justify-content: space-between; gap: 8px; }
.from { font-size: 18px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row.unread .from, .row.unread .subject { font-weight: 700; }
.row.unread .from::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #1e6bff; margin-right: 8px; vertical-align: middle; }
.time { font-size: 15px; color: #6b7280; flex: 0 0 auto; }
.subject { font-size: 17px; color: #1f2937; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snippet { font-size: 15px; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.draft-tag { color: #dc2626; font-weight: 700; }
.reader { flex: 1; min-width: 0; padding: 20px 26px; overflow: hidden; display: flex; flex-direction: column; }
.reader h1 { font-size: 27px; margin: 0 0 14px; line-height: 1.3; }
.sender { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #eef0f4; }
.avatar { width: 46px; height: 46px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
.sender-name { font-weight: 700; font-size: 19px; }
.meta { font-size: 15px; color: #6b7280; }
.label { font-weight: 700; color: #374151; margin-right: 6px; }
.reply-btn { margin-left: auto; border: 1px solid #c7d2fe; background: #eef2ff; color: #1e3a8a; border-radius: 10px; padding: 8px 18px; font-size: 17px; cursor: pointer; }
.body { white-space: pre-wrap; font-family: inherit; font-size: 19px; line-height: 1.55; color: #1f2937; margin: 16px 0 0; overflow: hidden; flex: 1; }
.body.short { flex: 0 1 auto; max-height: 300px; }
.composer { margin-top: 12px; border: 1px solid #c7d2fe; border-radius: 12px; display: flex; flex-direction: column; flex: 1; min-height: 220px; overflow: hidden; }
.composer-head { background: #eef2ff; padding: 8px 14px; font-size: 16px; color: #1e3a8a; font-weight: 600; }
.composer textarea { flex: 1; border: none; outline: none; resize: none; padding: 12px 14px; font-family: inherit; font-size: 20px; line-height: 1.5; }
.composer-foot { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; border-top: 1px solid #eef0f4; font-size: 15px; color: #6b7280; }
.ghost { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 4px 12px; font-size: 15px; cursor: pointer; }
.draft-banner, .spam-banner { border-radius: 10px; padding: 10px 14px; font-size: 17px; margin-bottom: 14px; }
.draft-banner { background: #fef3c7; color: #92400e; }
.spam-banner { background: #fee2e2; color: #991b1b; margin: 12px 0 0; }
.empty { color: #9ca3af; padding: 24px; font-size: 18px; }
</style>
