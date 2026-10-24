<script setup lang="ts">
// Browser: runs studio projects in a sandboxed iframe (srcdoc, opaque origin, no network) and
// can try to open a web address (most real sites refuse to be framed). See src/desktop/studio.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Lang } from '@shared/languages'
import { useSettings } from '@/stores/settings'
import { previewAddress } from '../studio/executor'
import { isPreviewMessage, PREVIEW_SANDBOX } from '../studio/srcdoc'
import { reloadPreview, showPreview, showUrl, showYoutube, studio } from '../studio/state'
import { studioStrings } from '../studio/strings'
import { getProject } from '../studio/vfs'
import { embedUrl, matchVideo, thumbUrl, TUBE_VIDEOS } from '../studio/youtube'
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
  if (p.kind === 'youtube') return p.videoId ? `youtube.com/watch?v=${p.videoId}` : p.query ? `youtube.com/results?search_query=${p.query}` : 'youtube.com'
  return project.value ? previewAddress(project.value, p.entry) : ''
})
const tube = computed(() => (pv.value?.kind === 'youtube' ? pv.value : null))
const playing = computed(() => (tube.value?.videoId ? TUBE_VIDEOS.find(v => v.id === tube.value!.videoId) ?? { id: tube.value.videoId, title: 'YouTube', channel: '' } : null))
const pageTitle = computed(() => project.value?.name ?? (tube.value ? (playing.value?.title ?? 'YouTube') : pv.value?.kind === 'url' ? address.value : ''))

const TUBE_TEXT: Record<Lang, { search: string, forYou: string, open: string, noMatch: string, upNext: string }> = {
  'en': { search: 'Search', forYou: 'Recommended', open: 'Open on youtube.com', noMatch: 'No exact match in this demo. Here are some picks.', upNext: 'Up next' },
  'ja': { search: '検索', forYou: 'おすすめ', open: 'youtube.com で開く', noMatch: 'このデモでは見つかりませんでした。おすすめをどうぞ。', upNext: '次の動画' },
  'ko': { search: '검색', forYou: '추천', open: 'youtube.com에서 열기', noMatch: '이 데모에서는 딱 맞는 영상이 없어요. 추천 영상을 골라 보세요.', upNext: '다음 동영상' },
  'zh-Hans': { search: '搜索', forYou: '推荐', open: '在 youtube.com 打开', noMatch: '本演示中没有完全匹配的视频，看看推荐吧。', upNext: '接下来播放' },
  'zh-Hant': { search: '搜尋', forYou: '推薦', open: '在 youtube.com 開啟', noMatch: '本示範中沒有完全符合的影片，看看推薦吧。', upNext: '接下來播放' },
}
const tt = computed(() => TUBE_TEXT[settings.lang] ?? TUBE_TEXT.en)
const tubeQuery = ref('')
watch(() => tube.value?.seq, () => { tubeQuery.value = tube.value?.query ?? '' }, { immediate: true })
function tubeSearch() {
  const q = tubeQuery.value.trim()
  showYoutube(q ? matchVideo(q)?.id ?? null : null, q)
}
function openRealYoutube() {
  const t = tube.value
  const url = t?.videoId ? `https://www.youtube.com/watch?v=${t.videoId}` : t?.query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(t.query)}` : 'https://www.youtube.com'
  window.open(url, '_blank', 'noopener')
}

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
      <div v-else-if="tube" class="yt">
        <div class="yt-top">
          <div class="yt-logo"><span class="yt-play" />YouTube</div>
          <form class="yt-search" @submit.prevent="tubeSearch">
            <input v-model="tubeQuery" :placeholder="tt.search" spellcheck="false" data-no-drag>
            <button type="submit" :aria-label="tt.search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg></button>
          </form>
          <button type="button" class="yt-open" @click="openRealYoutube">{{ tt.open }}</button>
        </div>
        <div v-if="playing" class="yt-watch">
          <div class="yt-player">
            <!-- Cross-origin frame: the capture shows the title card underneath instead. -->
            <div class="yt-cap">▶ {{ playing.title }}</div>
            <iframe
              :key="tube.seq" class="yt-frame" data-no-capture :src="embedUrl(playing.id)" :title="playing.title"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen
            />
          </div>
          <div class="yt-meta"><b>{{ playing.title }}</b><span>{{ playing.channel }}</span></div>
          <p class="yt-h">{{ tt.upNext }}</p>
          <div class="yt-row">
            <button v-for="v in TUBE_VIDEOS.filter(x => x.id !== playing!.id).slice(0, 6)" :key="v.id" type="button" class="yt-card sm" @click="showYoutube(v.id)">
              <img :src="thumbUrl(v.id)" alt="" crossorigin="anonymous"><b>{{ v.title }}</b><span>{{ v.channel }}</span>
            </button>
          </div>
        </div>
        <div v-else class="yt-home">
          <p v-if="tube.query" class="yt-note">{{ tt.noMatch }}</p>
          <p class="yt-h">{{ tt.forYou }}</p>
          <div class="yt-grid">
            <button v-for="v in TUBE_VIDEOS" :key="v.id" type="button" class="yt-card" @click="showYoutube(v.id)">
              <img :src="thumbUrl(v.id)" alt="" crossorigin="anonymous"><b>{{ v.title }}</b><span>{{ v.channel }}</span>
            </button>
          </div>
        </div>
      </div>
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
.yt { position: absolute; inset: 0; overflow-y: auto; background: #fff; font-family: Roboto, system-ui, -apple-system, sans-serif; color: #0f0f0f; }
.yt-top { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 18px; padding: 10px 20px; background: #fff; border-bottom: 1px solid #eee; }
.yt-logo { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 19px; letter-spacing: -0.04em; }
.yt-play { width: 30px; height: 21px; border-radius: 6px; background: #ff0033; position: relative; }
.yt-play::after { content: ''; position: absolute; left: 12px; top: 6px; border: 5px solid transparent; border-left: 8px solid #fff; border-right: 0; }
.yt-search { flex: 1; max-width: 540px; margin: 0 auto; display: flex; height: 38px; }
.yt-search input { flex: 1; min-width: 0; border: 1px solid #ccc; border-right: 0; border-radius: 20px 0 0 20px; padding: 0 16px; font: inherit; font-size: 15px; outline: none; }
.yt-search input:focus { border-color: #1c62b9; }
.yt-search button { width: 60px; border: 1px solid #ccc; border-radius: 0 20px 20px 0; background: #f8f8f8; cursor: pointer; }
.yt-search svg { width: 20px; height: 20px; stroke: #0f0f0f; stroke-width: 1.8; fill: none; }
.yt-open { border: 0; border-radius: 18px; padding: 8px 14px; background: #f2f2f2; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.yt-open:hover { background: #e5e5e5; }
.yt-home, .yt-watch { padding: 18px 22px 30px; }
.yt-h { margin: 6px 0 12px; font-size: 18px; font-weight: 700; }
.yt-note { margin: 0 0 8px; color: #606060; font-size: 14px; }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px 14px; }
.yt-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.yt-card { display: flex; flex-direction: column; gap: 4px; padding: 0; border: 0; background: none; text-align: left; font: inherit; cursor: pointer; color: inherit; }
.yt-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 12px; background: #eee; }
.yt-card b { font-size: 14px; font-weight: 600; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.yt-card span { font-size: 12.5px; color: #606060; }
.yt-card:hover img { filter: brightness(0.92); }
.yt-player { position: relative; width: 100%; max-width: 980px; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #000; }
.yt-cap { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 22px; font-weight: 600; padding: 20px; text-align: center; }
.yt-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.yt-meta { display: flex; flex-direction: column; gap: 4px; margin: 12px 0 18px; }
.yt-meta b { font-size: 19px; }
.yt-meta span { color: #606060; font-size: 14px; }
</style>
