<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDemo, type Mail, type MailDraft, type SentMail } from '@/stores/demo'
import { replySubject, replyToMail, sendMail } from '@/connectors/mock/mail'
import { stage } from '../actuator'
import { useAssistantMarks } from '../assistant-strings'
import { colorFor, displayName, initials } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'
import { registerMailCommands, type MailFolder } from '../menubar/bridge'

type Folder = MailFolder
type Item = Mail | MailDraft | SentMail

const demo = useDemo()
const { t, locale } = useDesktopStrings()
const marks = useAssistantMarks()
const folder = ref<Folder>('inbox')
const selectedId = ref<string | null>('mail-jp-001')
const composing = ref(false)
const replyBody = ref('')
/** Menu bar: File > New Message composer and View > Hide Sidebar. */
const newMsg = ref<{ to: string, subject: string, body: string } | null>(null)
const sidebar = ref(true)
const newToField = ref<HTMLInputElement | null>(null)

const inbox = computed(() => demo.mails.filter(m => !m.spam && !m.trashed).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)))
const spam = computed(() => demo.mails.filter(m => m.spam && !m.trashed))
const trash = computed(() => demo.mails.filter(m => m.trashed).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)))
const drafts = computed(() => [...demo.drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const sent = computed(() => [...demo.sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt)))
const unread = computed(() => inbox.value.filter(m => !m.read).length)

const list = computed<Item[]>(() => {
  switch (folder.value) {
    case 'inbox': return inbox.value
    case 'spam': return spam.value
    case 'trash': return trash.value
    case 'sent': return sent.value
    default: return drafts.value
  }
})

const selectedMail = computed(() => demo.mails.find(m => m.id === selectedId.value) ?? null)
const selectedDraft = computed(() => demo.drafts.find(d => d.id === selectedId.value) ?? null)
const selectedSent = computed(() => demo.sent.find(m => m.id === selectedId.value) ?? null)
/** The received mail a sent reply answers (shown under it as the thread). */
const sentOriginal = computed(() => (selectedSent.value?.replyToId ? demo.mails.find(m => m.id === selectedSent.value!.replyToId) ?? null : null))

function isMail(x: Item): x is Mail {
  return 'from' in x
}
function isSent(x: Item): x is SentMail {
  return 'sentAt' in x
}

/** Text the assistant is typing into this app right now. */
const agentTyping = computed(() => (stage.typing?.app === 'mail' ? stage.typing : null))
const agentReply = computed(() => !!agentTyping.value?.mailId && agentTyping.value.mailId === selectedMail.value?.id)
const agentNew = computed(() => !!agentTyping.value && !agentTyping.value.mailId)

// The assistant starts typing a reply: show that mail with the composer open.
watch(() => agentTyping.value?.mailId, (id) => {
  if (!id) return
  const m = demo.mails.find(x => x.id === id)
  if (!m) return
  folder.value = m.trashed ? 'trash' : m.spam ? 'spam' : 'inbox'
  selectedId.value = id
  composing.value = false
  newMsg.value = null
})

// The assistant finished an action: jump to its result.
watch(() => stage.reveal?.seq, () => {
  const r = stage.reveal
  if (!r || r.app !== 'mail') return
  const id = (k: string) => (typeof r.data[k] === 'string' ? r.data[k] as string : null)
  composing.value = false
  newMsg.value = null
  if (r.op === 'mail_reply' || r.op === 'mail_send' || r.op === 'mail_send_draft') { folder.value = 'sent'; selectedId.value = id('sentId') }
  else if (r.op === 'mail_trash') { folder.value = 'trash'; selectedId.value = id('id') }
  else if (r.op === 'mail_restore') { folder.value = 'inbox'; selectedId.value = id('id') }
})

function restore(m: Mail) {
  m.trashed = false
  pickFolder('inbox')
  selectedId.value = m.id
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

/** Reply composer prefilled with the quoted original, cursor at the top. */
function startReply() {
  const m = selectedMail.value
  if (!m) return
  composing.value = true
  newMsg.value = null
  const quoted = m.body.split('\n').map(l => `> ${l}`).join('\n')
  replyBody.value = `\n\n${t.value.mail.wrote(fullDate(m.receivedAt), displayName(m.from))}\n${quoted}`
  void nextTick(() => {
    const el = replyField.value
    if (el) { el.focus(); el.setSelectionRange(0, 0); el.scrollTop = 0 }
  })
}

const replyField = ref<HTMLTextAreaElement | null>(null)

function showSent(id: string) {
  folder.value = 'sent'
  selectedId.value = id
}

/** User-initiated sends need no confirm card; they use the same store path as the agent. */
function sendNew() {
  const n = newMsg.value
  if (!n || !n.to.trim()) return
  const s = sendMail(demo, { to: n.to.trim(), subject: n.subject.trim(), body: n.body }, false)
  newMsg.value = null
  showSent(s.id)
}

function saveNewDraft() {
  const n = newMsg.value
  if (!n) return
  demo.addDraft({ to: n.to.trim(), subject: n.subject.trim(), body: n.body })
  newMsg.value = null
}

function sendReply() {
  const m = selectedMail.value
  if (!m || !replyBody.value.trim()) return
  const s = replyToMail(demo, { id: m.id, body: replyBody.value }, false)
  composing.value = false
  showSent(s.id)
}

function saveReplyDraft() {
  const m = selectedMail.value
  if (!m) return
  demo.addDraft({ replyToId: m.id, to: m.from, subject: replySubject(m.subject), body: replyBody.value })
  composing.value = false
}

function sendDraft(d: MailDraft) {
  const i = demo.drafts.findIndex(x => x.id === d.id)
  if (i < 0 || !d.to.trim()) return
  demo.drafts.splice(i, 1)
  const s = sendMail(demo, { to: d.to, subject: d.subject, body: d.body, replyToId: d.replyToId }, false)
  showSent(s.id)
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
  if (folder.value === 'sent') return selectedSent.value ? `Sent: ${selectedSent.value.subject}` : 'Sent'
  if (selectedMail.value) return `${selectedMail.value.subject} — ${displayName(selectedMail.value.from)}`
  return folder.value === 'spam' ? 'Spam' : folder.value === 'trash' ? 'Trash' : 'Inbox'
})
watch(title, v => setWindowTitle('mail', `Mail — ${v}`), { immediate: true })

const folderName = computed(() => ({ inbox: t.value.mail.inbox, drafts: t.value.mail.drafts, spam: t.value.mail.junk, sent: t.value.mail.sent, trash: t.value.trash })[folder.value])
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
      <button class="mb" :class="{ on: folder === 'sent' }" @click="pickFolder('sent')">
        <svg viewBox="0 0 20 20"><path d="M3 10l14-6-5 13-2.5-5.5z" /></svg>
        <span>{{ t.mail.sent }}</span><b v-if="sent.length" class="muted">{{ sent.length }}</b>
      </button>
      <div class="side-section">{{ t.mail.mailboxes }}</div>
      <button class="mb" :class="{ on: folder === 'spam' }" @click="pickFolder('spam')">
        <svg viewBox="0 0 20 20"><path d="M3 4h14v12H3zM6 7l8 6M14 7l-8 6" /></svg>
        <span>{{ t.mail.junk }}</span><b v-if="spam.length" class="muted">{{ spam.length }}</b>
      </button>
      <button class="mb" :class="{ on: folder === 'trash' }" @click="pickFolder('trash')">
        <svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M5.5 6l1 11h7l1-11" /></svg>
        <span>{{ t.trash }}</span><b v-if="trash.length" class="muted">{{ trash.length }}</b>
      </button>
      <div class="account">{{ account }}</div>
    </aside>

    <div class="list">
      <div class="toolbar list-bar" :class="{ 'under-lights': !sidebar }" data-wf-drag>
        <div class="tb-title">
          <strong>{{ folderName }}</strong>
          <span>{{ folderInfo }}</span>
        </div>
        <button class="tb-icon compose-btn" type="button" :title="t.mail.newMessage" :aria-label="t.mail.newMessage" @click="startNewMessage">
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
            <template v-else-if="isSent(item)">
              <div class="row-top"><span class="from">{{ t.mail.to }}: {{ displayName(item.to) }}</span><span class="time">{{ listTime(item.sentAt) }}</span></div>
              <div class="subject">{{ item.subject }}</div>
              <div class="snippet">{{ item.body.replace(/\s+/g, ' ').slice(0, 120) }}</div>
              <div v-if="item.viaAssistant" class="via">{{ marks.via }}</div>
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
          <textarea v-model="newMsg.body" class="new-body" spellcheck="false" />
          <div class="composer-foot">
            <span>{{ t.mail.composerHint }}</span>
            <div class="foot-actions">
              <button type="button" class="ghost" @click="newMsg = null">{{ t.mail.discard }}</button>
              <button type="button" class="ghost" @click="saveNewDraft">{{ t.mail.saveDraft }}</button>
              <button type="button" class="send" :disabled="!newMsg.to.trim()" @click="sendNew">{{ t.mail.send }}</button>
            </div>
          </div>
        </div>
        <div v-else-if="agentNew && agentTyping" class="composer new-msg agent">
          <div class="composer-head">{{ t.mail.newMessage }}</div>
          <div class="nm-field"><span>{{ t.mail.to }}:</span><b>{{ agentTyping.to }}</b></div>
          <div class="nm-field"><span>{{ t.mb.subject }}:</span><b>{{ agentTyping.subject }}</b></div>
          <div class="agent-text">{{ agentTyping.text }}<i class="caret" /></div>
          <div class="composer-foot"><span class="typing-tag">{{ marks.typing }}</span></div>
        </div>
        <template v-else-if="folder === 'sent' && selectedSent">
          <div v-if="selectedSent.viaAssistant" class="sent-banner">{{ marks.sentBanner }}</div>
          <div class="head">
            <div class="head-main">
              <div class="head-row"><span class="sender-name">{{ t.mail.to }}: {{ displayName(selectedSent.to) }}</span><span class="date">{{ fullDate(selectedSent.sentAt) }}</span></div>
              <div class="subj">{{ selectedSent.subject }}</div>
            </div>
          </div>
          <pre class="body short">{{ selectedSent.body }}</pre>
          <div v-if="sentOriginal" class="thread">
            <div class="thread-head">{{ marks.original }} — {{ displayName(sentOriginal.from) }}, {{ fullDate(sentOriginal.receivedAt) }}</div>
            <pre class="thread-body">{{ sentOriginal.body }}</pre>
          </div>
        </template>
        <template v-else-if="folder === 'drafts' && selectedDraft">
          <div class="draft-banner">{{ t.mail.draftBanner }}</div>
          <div class="head">
            <div class="head-main">
              <div class="subj">{{ selectedDraft.subject }}</div>
              <div class="meta"><span class="label">{{ t.mail.to }}:</span> {{ selectedDraft.to }}</div>
            </div>
          </div>
          <pre class="body">{{ selectedDraft.body }}</pre>
          <div class="draft-actions">
            <button type="button" class="send" :disabled="!selectedDraft.to.trim()" @click="sendDraft(selectedDraft)">{{ t.mail.send }}</button>
          </div>
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
          <div v-if="selectedMail.trashed" class="trash-banner">
            <span>{{ marks.trashBanner }}</span>
            <button type="button" class="ghost" @click="restore(selectedMail)">{{ marks.restore }}</button>
          </div>
          <div v-if="selectedMail.spam" class="spam-banner">{{ t.mail.junkBanner }}</div>
          <pre class="body" :class="{ short: composing || agentReply }">{{ selectedMail.body }}</pre>
          <div v-if="agentReply && agentTyping" class="composer agent">
            <div class="composer-head">{{ t.mail.replyTo(displayName(selectedMail.from)) }} — Re: {{ selectedMail.subject }}</div>
            <div class="agent-text">{{ agentTyping.text }}<i class="caret" /></div>
            <div class="composer-foot"><span class="typing-tag">{{ marks.typing }}</span></div>
          </div>
          <div v-else-if="composing" class="composer">
            <div class="composer-head">{{ t.mail.replyTo(displayName(selectedMail.from)) }} — Re: {{ selectedMail.subject }}</div>
            <textarea ref="replyField" v-model="replyBody" class="reply-body" :placeholder="t.mail.placeholder" spellcheck="false" />
            <div class="composer-foot">
              <span>{{ t.mail.composerHint }}</span>
              <div class="foot-actions">
                <button type="button" class="ghost" @click="composing = false">{{ t.mail.discard }}</button>
                <button type="button" class="ghost" @click="saveReplyDraft">{{ t.mail.saveDraft }}</button>
                <button type="button" class="send" :disabled="!replyBody.trim()" @click="sendReply">{{ t.mail.send }}</button>
              </div>
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
.via { font-size: 12px; color: #c2185b; margin-top: 3px; font-weight: 600; }
.row.on .via { color: #ffd6e4; }
.sent-banner { border-radius: 8px; padding: 9px 14px; font-size: 15px; margin-bottom: 14px; background: #fde7ef; color: #a1134a; }
.trash-banner { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; padding: 7px 14px; font-size: 15px; margin: 12px 0 0; background: #eef0f4; color: #3a3a3c; }
.thread { margin-top: 14px; border-left: 3px solid rgba(0, 122, 255, 0.35); padding: 4px 0 4px 14px; min-height: 0; overflow: hidden; flex: 1; }
.thread-head { font-size: 14px; color: rgba(60, 60, 67, 0.7); font-weight: 600; margin-bottom: 6px; }
.thread-body { white-space: pre-wrap; font-family: inherit; font-size: 15px; line-height: 1.5; color: rgba(60, 60, 67, 0.85); margin: 0; }
.composer.agent { border-color: rgba(226, 69, 111, 0.55); box-shadow: 0 0 0 3px rgba(226, 69, 111, 0.15), 0 4px 14px rgba(0, 0, 0, 0.08); }
.agent-text { flex: 1; padding: 12px 14px; font-size: 18px; line-height: 1.5; white-space: pre-wrap; overflow: hidden; }
.caret { display: inline-block; width: 2px; height: 1.1em; margin-left: 1px; vertical-align: text-bottom; background: #e2456f; animation: caret-blink 0.9s steps(1) infinite; }
@keyframes caret-blink { 50% { opacity: 0; } }
.typing-tag { color: #c2185b; font-weight: 600; }
.nm-field b { font-weight: 500; color: #1d1d1f; }
.foot-actions { display: flex; gap: 8px; }
.send { border: none; background: #007aff; color: #fff; border-radius: 6px; padding: 4px 16px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.send:disabled { background: #a7c8f5; cursor: default; }
.draft-actions { display: flex; justify-content: flex-end; padding-top: 10px; }
.empty.center { margin: auto; }
</style>
