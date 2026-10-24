<script setup lang="ts">
// Browser: runs studio projects in a sandboxed iframe (srcdoc, opaque origin, no network) and
// can try to open a web address (most real sites refuse to be framed). See src/desktop/studio.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettings } from '@/stores/settings'
import { previewAddress } from '../studio/executor'
import { isPreviewMessage, PREVIEW_SANDBOX } from '../studio/srcdoc'
import { reloadPreview, showPreview, showUrl, studio } from '../studio/state'
import { studioStrings } from '../studio/strings'
import { getProject } from '../studio/vfs'
import { setWindowTitle } from '../windows'

const settings = useSettings()
const s = computed(() => studioStrings(settings.lang))
const frame = ref<HTMLIFrameElement | null>(null)

const pv = computed(() => studio.preview)
const project = computed(() => (pv.value?.kind === 'project' ? getProject(studio.vfs, pv.value.projectId) : undefined))
const address = computed(() => {
  const p = pv.value
  if (!p) return ''
  if (p.kind === 'url') return p.url
  return project.value ? previewAddress(project.value, p.entry) : ''
})
const pageTitle = computed(() => project.value?.name ?? (pv.value?.kind === 'url' ? address.value : ''))

const editing = ref(false)
const draft = ref('')
function startEdit() {
  draft.value = address.value
  editing.value = true
}
function submit() {
  editing.value = false
  const v = draft.value.trim()
  if (!v) return
  // yuiyumi.local/<slug> opens a studio project; anything else is tried as a web address.
  const local = v.match(/^(?:https?:\/\/)?yuiyumi\.local\/([^/?#]+)/i)
  if (local) {
    const slug = decodeURIComponent(local[1]!)
    const p = studio.vfs.projects.find(x => x.slug === slug)
    if (p) void showPreview(p.id, 'index.html')
    return
  }
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' || u.protocol === 'http:') showUrl(u.href)
  } catch { /* not an address */ }
}

function onMessage(e: MessageEvent) {
  // Only messages from our own preview frame; their content is untrusted and only counted/shown.
  if (!frame.value || e.source !== frame.value.contentWindow || !isPreviewMessage(e.data)) return
  const seq = studio.preview?.seq ?? 0
  if (e.data.kind === 'ready') studio.previewReady = seq
  else if (studio.previewErrors.length < 10) studio.previewErrors.push(e.data.message.slice(0, 300))
}

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

watch(pageTitle, t => setWindowTitle('browser', t ? `${t} — Browser` : 'Browser'), { immediate: true })
</script>

<template>
  <div class="br">
    <header class="tb" data-wf-drag>
      <div class="nav">
        <button type="button" class="nb" disabled :title="s.browser.back"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg></button>
        <button type="button" class="nb" disabled :title="s.browser.forward"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg></button>
      </div>
      <div class="addr" data-no-drag @click="!editing && startEdit()">
        <input
          v-if="editing"
          v-model="draft"
          class="addr-input"
          spellcheck="false"
          autofocus
          :placeholder="s.browser.address"
          @keydown.enter="submit"
          @keydown.esc="editing = false"
          @blur="editing = false"
        >
        <template v-else>
          <svg v-if="pv" class="lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" /></svg>
          <span class="addr-text" :class="{ ph: !address }">{{ address || s.browser.address }}</span>
        </template>
        <button v-if="pv && !editing" type="button" class="reload" :title="s.browser.reload" @click.stop="reloadPreview()">
          <svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" /></svg>
        </button>
      </div>
      <div class="right">
        <span v-if="studio.previewErrors.length" class="errs" :title="studio.previewErrors.join('\n')">{{ s.browser.errors(studio.previewErrors.length) }}</span>
      </div>
    </header>

    <div class="view">
      <iframe
        v-if="pv?.kind === 'project'"
        ref="frame"
        :key="pv.seq"
        class="frame"
        :sandbox="PREVIEW_SANDBOX"
        :srcdoc="pv.srcdoc"
        referrerpolicy="no-referrer"
        allow=""
        :title="pageTitle"
      />
      <template v-else-if="pv?.kind === 'url'">
        <iframe
          ref="frame"
          :key="pv.seq"
          class="frame"
          :sandbox="PREVIEW_SANDBOX"
          :src="pv.url"
          referrerpolicy="no-referrer"
          allow=""
          :title="pv.url"
        />
        <div class="framed-note">{{ s.browser.framed }}</div>
      </template>
      <div v-else class="empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" /><path d="M10 32h44M32 10c7 7 7 37 0 44M32 10c-7 7-7 37 0 44" /></svg>
        <p class="e1">{{ s.browser.empty }}</p>
        <p class="e2">{{ s.browser.emptyHint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.br { display: flex; flex-direction: column; height: 100%; background: #fff; }
.tb {
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px 0 120px;
  background: #f4f4f6;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.nav { display: flex; gap: 4px; }
.nb { width: 30px; height: 30px; border: none; border-radius: 7px; background: none; display: flex; align-items: center; justify-content: center; }
.nb svg, .reload svg { width: 15px; height: 15px; stroke: #6e6e73; stroke-width: 1.8; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.nb:disabled svg { stroke: #c4c4c8; }
.addr {
  flex: 1;
  max-width: 560px;
  margin: 0 auto;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 6px 0 12px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 15px;
  color: #1d1d1f;
  cursor: text;
  position: relative;
}
.lock { width: 13px; height: 13px; stroke: #6e6e73; stroke-width: 1.5; fill: none; flex: none; }
.addr-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.addr-text.ph { color: #8e8e93; }
.addr-input { width: 100%; border: none; outline: none; background: none; font: inherit; color: inherit; text-align: left; }
.reload { position: absolute; right: 4px; width: 28px; height: 28px; border: none; border-radius: 6px; background: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.reload:hover { background: rgba(0, 0, 0, 0.07); }
.right { width: 120px; display: flex; justify-content: flex-end; }
.errs { padding: 3px 9px; border-radius: 6px; background: #fde8e8; color: #c62828; font-size: 13px; font-weight: 600; }
.view { flex: 1; min-height: 0; position: relative; background: #fff; }
.frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
.framed-note { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); padding: 6px 14px; border-radius: 8px; background: rgba(29, 29, 31, 0.78); color: #fff; font-size: 13px; pointer-events: none; }
.empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8e8e93; }
.empty svg { width: 80px; height: 80px; stroke: #c7c7cc; stroke-width: 2.5; fill: none; margin-bottom: 10px; }
.e1 { margin: 0; font-size: 19px; font-weight: 600; color: #6e6e73; }
.e2 { margin: 6px 0 0; font-size: 15px; }
</style>
