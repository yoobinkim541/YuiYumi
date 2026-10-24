<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDemo, type Mail, type MailDraft } from '@/stores/demo'
import { colorFor, displayName, initials } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'
import { registerMailCommands } from '../menubar/bridge'

type Folder = 'inbox' | 'drafts' | 'spam'

const demo = useDemo()
const { t, locale } = useDesktopStrings()
const folder = ref<Folder>('inbox')
const selectedId = ref<string | null>('mail-jp-001')
const composing = ref(false)
const replyBody = ref('')
/** Menu bar: File > New Message composer and View > Hide Sidebar. */
const newMsg = ref<{ to: string, subject: string, body: string } | null>(null)
const sidebar = ref(true)
const newToField = ref<HTMLInputElement | null>(null)

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
  newMsg.value = null
  const m = demo.mails.find(x => x.id === id)
  if (m) m.read = true
}

function pickFolder(f: Folder) {
  folder.value = f
  composing.value = false
  newMsg.value = null
  selectedId.value = list.value[0]?.id ?? null
}

function startReply() {
  composing.value = true
  newMsg.value = null
  replyBody.value = ''
}

function startNewMessage() {
  composing.value = false
  newMsg.value = { to: '', subject: '', body: '' }
  void nextTick(() => newToField.value?.focus())
}

registerMailCommands({
  newMessage: startNewMessage,
  showFolder: pickFolder,
  toggleSidebar: () => { sidebar.value = !sidebar.value },
  reply: () => { if (selectedMail.value) startReply() },
  state: () => ({ folder: folder.value, sidebar: sidebar.value, canReply: !!selectedMail.value }),
})

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
  if (newMsg.value) return t.value.mail.newMessage
  if (composing.value && selectedMail.value) return `Reply: ${selectedMail.value.subject}`
  if (folder.value === 'drafts') return selectedDraft.value ? `Draft: ${selectedDraft.value.subject}` : 'Drafts'
  if (selectedMail.value) return `${selectedMail.value.subject} — ${displayName(selectedMail.value.from)}`
  return folder.value === 'spam' ? 'Spam' : 'Inbox'
})
watch(title, v => setWindowTitle('mail', `Mail — ${v}`), { immediate: true })

const folderName = computed(() => folder.value === 'inbox' ? t.value.mail.inbox : folder.value === 'drafts' ? t.value.mail.drafts : t.value.mail.junk)
const folderInfo = computed(() => t.value.mail.messages(list.value.length, folder.value === 'inbox' ? unread.value : 0))
/** The mailbox owner, taken from the seeded mails so it follows the demo language. */
const account = computed(() => {
  const to = demo.mails[0]?.to ?? ''
  return to.match(/<([^>]+)>/)?.[1] ?? to
})
function fullDate(iso: string) {
  return new Date(iso).toLocaleString(locale.value, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function listTime(iso: string) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(locale.value, { month: 'numeric', day: 'numeric' })
}
</script>

<template>
  <div class="mail">
    <aside v-show="sidebar" class="side" data-wf-drag>
      <div class="side-top" />
      <div class="side-section">{{ t.mail.favorites }}</div>
      <button class="mb" :class="{ on: folder === 'inbox' }" @click="pickFolder('inbox')">
        <svg viewBox="0 0 20 20"><path d="M3 11l2-7h10l2 7v5H3zM3 11h4l1 2h4l1-2h4" /></svg>
        <span>{{ t.mail.inbox }}</span><b v-if="unread">{{ unread }}</b>
      </button>
      <button class="mb" :class="{ on: folder === 'drafts' }" @click="pickFolder('drafts')">
        <svg viewBox="0 0 20 20"><path d="M5 3h7l3 3v11H5zM12 3v3h3M7.5 10h5M7.5 13h5" /></svg>
        <span>{{ t.mail.drafts }}</span><b v-if="drafts.length" class="muted">{{ drafts.length }}</b>
      </button>
      <div class="side-section">{{ t.mail.mailboxes }}</div>
      <button class="mb" :class="{ on: folder === 'spam' }" @click="pickFolder('spam')">
        <svg viewBox="0 0 20 20"><path d="M3 4h14v12H3zM6 7l8 6M14 7l-8 6" /></svg>
        <span>{{ t.mail.junk }}</span><b v-if="spam.length" class="muted">{{ spam.length }}</b>
      </button>
      <div class="account">{{ account }}</div>
    </aside>

    <div class="list">
      <div class="toolbar list-bar" :class="{ 'under-lights': !sidebar }" data-wf-drag>
        <div class="tb-title">
          <strong>{{ folderName }}</strong>
          <span>{{ folderInfo }}</span>
        </div>
        <button class="tb-icon" type="button" :title="t.mail.newMessage" @click="selectedMail && startReply()">
          <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>
        </button>
      </div>
      <div class="rows">
        <div v-if="!list.length" class="empty">{{ t.mail.noMessages }}</div>
        <button
          v-for="item in list"
          :key="item.id"
          class="row"
          :class="{ on: item.id === selectedId, unread: isMail(item) && !item.read }"
          @click="open(item.id)"
        >
          <span class="dot" />
          <div class="row-main">
            <template v-if="isMail(item)">
              <div class="row-top"><span class="from">{{ displayName(item.from) }}</span><span class="time">{{ listTime(item.receivedAt) }}</span></div>
              <div class="subject">{{ item.subject }}</div>
              <div class="snippet">{{ item.body.replace(/\s+/g, ' ').slice(0, 120) }}</div>
            </template>
            <template v-else>
              <div class="row-top"><span class="from draft-tag">{{ t.mail.draft }}</span><span class="time">{{ listTime(item.createdAt) }}</span></div>
              <div class="subject">{{ item.subject }}</div>
              <div class="snippet">{{ t.mail.to }}: {{ item.to }}</div>
            </template>
          </div>
        </button>
      </div>
    </div>

    <main class="reader">
      <div class="toolbar reader-bar" data-wf-drag>
        <div class="tb-group">
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M4 7h16v3H4zM5 10h14v9H5zM10 13h4" /></svg></span>
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></span>
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM7 8l10 8M17 8L7 16" /></svg></span>
        </div>
        <div class="tb-group">
          <button class="tb-icon" type="button" :title="t.mail.reply" :disabled="!selectedMail" @click="startReply">
            <svg viewBox="0 0 24 24"><path d="M10 6L4 12l6 6M4 12h10a6 6 0 0 1 6 6" /></svg>
          </button>
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M9 6L3 12l6 6M14 6l-6 6 6 6M8 12h7a6 6 0 0 1 6 6" /></svg></span>
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M14 6l6 6-6 6M20 12H10a6 6 0 0 0-6 6" /></svg></span>
          <span class="tb-icon"><svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></svg></span>
        </div>
        <div class="tb-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>{{ t.mail.search }}</div>
      </div>
      <div class="reader-body">
        <div v-if="newMsg" class="composer new-msg">
          <div class="composer-head">{{ t.mail.newMessage }}</div>
          <label class="nm-field"><span>{{ t.mail.to }}:</span><input ref="newToField" v-model="newMsg.to" type="text" spellcheck="false"></label>
          <label class="nm-field"><span>{{ t.mb.subject }}:</span><input v-model="newMsg.subject" type="text" spellcheck="false"></label>
          <textarea v-model="newMsg.body" spellcheck="false" />
          <div class="composer-foot">
            <span>{{ t.mail.composerHint }}</span>
            <button type="button" class="ghost" @click="newMsg = null">{{ t.mail.discard }}</button>
          </div>
        </div>
        <template v-else-if="folder === 'drafts' && selectedDraft">
          <div class="draft-banner">{{ t.mail.draftBanner }}</div>
          <div class="head">
            <div class="head-main">
              <div class="subj">{{ selectedDraft.subject }}</div>
              <div class="meta"><span class="label">{{ t.mail.to }}:</span> {{ selectedDraft.to }}</div>
            </div>
          </div>
          <pre class="body">{{ selectedDraft.body }}</pre>
        </template>
        <template v-else-if="selectedMail">
          <div class="head">
            <span class="avatar" :style="{ background: colorFor(selectedMail.from) }">{{ initials(selectedMail.from) }}</span>
            <div class="head-main">
              <div class="head-row"><span class="sender-name">{{ displayName(selectedMail.from) }}</span><span class="date">{{ fullDate(selectedMail.receivedAt) }}</span></div>
              <div class="subj">{{ selectedMail.subject }}</div>
              <div class="meta"><span class="label">{{ t.mail.to }}:</span> {{ selectedMail.to }}</div>
            </div>
          </div>
          <div v-if="selectedMail.spam" class="spam-banner">{{ t.mail.junkBanner }}</div>
          <pre class="body" :class="{ short: composing }">{{ selectedMail.body }}</pre>
          <div v-if="composing" class="composer">
            <div class="composer-head">{{ t.mail.replyTo(displayName(selectedMail.from)) }} — Re: {{ selectedMail.subject }}</div>
            <textarea v-model="replyBody" :placeholder="t.mail.placeholder" spellcheck="false" />
            <div class="composer-foot">
              <span>{{ t.mail.composerHint }}</span>
              <button type="button" class="ghost" @click="composing = false">{{ t.mail.discard }}</button>
            </div>
          </div>
        </template>
        <div v-else class="empty center">{{ t.mail.selectMessage }}</div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.mail { display: flex; height: 100%; font-size: 18px; color: #1d1d1f; }
/* Vibrancy sidebar: translucent over the wallpaper. */
.side {
  width: 230px; flex: 0 0 230px; display: flex; flex-direction: column; gap: 2px; padding: 0 12px 14px;
  background: rgba(232, 232, 238, 0.72); backdrop-filter: saturate(180%) blur(30px); -webkit-backdrop-filter: saturate(180%) blur(30px);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}
.side-top { height: 56px; flex: none; }
.side-section { font-size: 13px; font-weight: 700; color: rgba(60, 60, 67, 0.55); padding: 12px 10px 4px; }
.mb { display: flex; align-items: center; gap: 10px; border: none; background: none; padding: 7px 10px; border-radius: 8px; font-size: 17px; color: #1d1d1f; cursor: pointer; text-align: left; font-family: inherit; }
.mb svg { width: 20px; height: 20px; flex: none; fill: none; stroke: #007aff; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.mb span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mb.on { background: rgba(0, 0, 0, 0.09); font-weight: 600; }
.mb b { font-size: 14px; font-weight: 600; color: rgba(60, 60, 67, 0.7); }
.account { margin-top: auto; font-size: 12px; color: rgba(60, 60, 67, 0.6); padding: 0 10px; word-break: break-all; }
.toolbar { height: 56px; flex: 0 0 56px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid rgba(0, 0, 0, 0.08); background: rgba(255, 255, 255, 0.96); user-select: none; }
.tb-title { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.tb-title strong { font-size: 17px; }
.tb-title span { font-size: 13px; color: rgba(60, 60, 67, 0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tb-icon { width: 36px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: none; background: none; border-radius: 7px; padding: 0; color: #5c5c62; cursor: default; }
button.tb-icon { cursor: pointer; }
button.tb-icon:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
.tb-icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.tb-group { display: flex; gap: 2px; }
.reader-bar { justify-content: space-between; gap: 18px; }
.tb-search { margin-left: auto; display: flex; align-items: center; gap: 6px; width: 190px; height: 30px; padding: 0 10px; border-radius: 8px; background: rgba(118, 118, 128, 0.12); color: rgba(60, 60, 67, 0.6); font-size: 15px; }
.tb-search svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
.list { width: 380px; flex: 0 0 380px; border-right: 1px solid rgba(0, 0, 0, 0.08); display: flex; flex-direction: column; background: #fff; }
.rows { flex: 1; overflow: hidden; padding: 4px 8px; }
.row { display: flex; gap: 6px; width: 100%; border: none; background: none; text-align: left; padding: 10px 10px 10px 4px; border-radius: 9px; cursor: pointer; font-family: inherit; color: inherit; position: relative; }
.row + .row::before { content: ''; position: absolute; left: 26px; right: 10px; top: 0; border-top: 1px solid rgba(0, 0, 0, 0.07); }
.row.on { background: #0a64d8; color: #fff; }
.row.on::before, .row.on + .row::before { display: none; }
.dot { width: 10px; height: 10px; flex: none; border-radius: 50%; margin: 6px 4px 0; }
.row.unread .dot { background: #007aff; }
.row.on.unread .dot { background: #fff; }
.row-main { flex: 1; min-width: 0; }
.row-top { display: flex; justify-content: space-between; gap: 8px; }
.from { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.time { font-size: 14px; color: rgba(60, 60, 67, 0.6); flex: 0 0 auto; }
.subject { font-size: 15px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snippet { font-size: 14px; color: rgba(60, 60, 67, 0.6); margin-top: 2px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.row.on .time, .row.on .snippet { color: rgba(255, 255, 255, 0.82); }
.draft-tag { color: #d70015; }
.row.on .draft-tag { color: #fff; }
.reader { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #fff; }
.reader-body { flex: 1; min-height: 0; padding: 18px 28px; overflow: hidden; display: flex; flex-direction: column; }
.head { display: flex; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
.head-main { flex: 1; min-width: 0; }
.head-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.avatar { width: 48px; height: 48px; flex: none; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 20px; }
.sender-name { font-weight: 700; font-size: 19px; }
.date { font-size: 14px; color: rgba(60, 60, 67, 0.6); white-space: nowrap; }
.subj { font-size: 17px; font-weight: 600; margin-top: 2px; line-height: 1.3; }
.meta { font-size: 14px; color: rgba(60, 60, 67, 0.6); margin-top: 2px; }
.label { color: rgba(60, 60, 67, 0.75); margin-right: 4px; }
.body { white-space: pre-wrap; font-family: inherit; font-size: 18px; line-height: 1.55; color: #1d1d1f; margin: 16px 0 0; overflow: hidden; flex: 1; }
.body.short { flex: 0 1 auto; max-height: 300px; }
.composer { margin-top: 12px; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 10px; display: flex; flex-direction: column; flex: 1; min-height: 220px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); }
.composer-head { background: #f5f5f7; padding: 8px 14px; font-size: 15px; color: #3a3a3c; font-weight: 600; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
.composer textarea { flex: 1; border: none; outline: none; resize: none; padding: 12px 14px; font-family: inherit; font-size: 18px; line-height: 1.5; }
.composer-foot { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; border-top: 1px solid rgba(0, 0, 0, 0.08); font-size: 14px; color: rgba(60, 60, 67, 0.6); }
.list-bar.under-lights { padding-left: 96px; }
.composer.new-msg { margin-top: 0; }
.nm-field { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid rgba(0, 0, 0, 0.08); font-size: 15px; color: rgba(60, 60, 67, 0.75); }
.nm-field input { flex: 1; border: none; outline: none; font-family: inherit; font-size: 16px; color: #1d1d1f; background: transparent; }
.ghost { border: 1px solid rgba(0, 0, 0, 0.15); background: #fff; border-radius: 6px; padding: 3px 12px; font-size: 14px; cursor: pointer; font-family: inherit; }
.draft-banner, .spam-banner { border-radius: 8px; padding: 9px 14px; font-size: 15px; margin-bottom: 14px; }
.draft-banner { background: #fff6dc; color: #8a5a00; }
.spam-banner { background: #fff0e5; color: #9a3412; margin: 12px 0 0; }
.empty { color: rgba(60, 60, 67, 0.5); padding: 24px; font-size: 17px; }
.empty.center { margin: auto; }
</style>
