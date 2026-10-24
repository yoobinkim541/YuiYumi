<script setup lang="ts">
// Code: the virtual coding studio's editor (file tree, tabs, highlighted code). Read-only;
// the agent writes here and the user watches files being typed. See src/desktop/studio.
import { computed, nextTick, ref, watch } from 'vue'
import { extensionOf } from '@shared/studio'
import { useCharacterStore } from '@/character/store'
import { useSettings } from '@/stores/settings'
import { highlightLines, langOf } from '../studio/highlight'
import { activeProject, closeTab, openFile, openProject, pendingKey, showPreview, studio, visibleContent } from '../studio/state'
import { showStudioWindow } from '../studio/stage'
import { characterName, studioStrings } from '../studio/strings'
import { sortedPaths } from '../studio/vfs'
import { setWindowTitle } from '../windows'
import '../studio/dev'

const settings = useSettings()
const character = useCharacterStore()
const s = computed(() => studioStrings(settings.lang))
const who = computed(() => characterName(character.character, settings.lang))

const project = computed(() => activeProject())
const files = computed(() => {
  const p = project.value
  return p ? sortedPaths(p).filter(path => !studio.pending[pendingKey(p.id, path)]) : []
})
const projects = computed(() => [...studio.vfs.projects].reverse())
const tabs = computed(() => studio.openTabs.filter(t => files.value.includes(t)))
const path = computed(() => (studio.activePath && files.value.includes(studio.activePath) ? studio.activePath : null))
const typingHere = computed(() => !!studio.typing && studio.typing.projectId === project.value?.id && studio.typing.path === path.value)
const typingPath = computed(() => (studio.typing && studio.typing.projectId === project.value?.id ? studio.typing.path : null))

const text = computed(() => (project.value && path.value ? visibleContent(project.value.id, path.value) : ''))
const lang = computed(() => langOf(path.value ?? ''))
const lines = computed(() => {
  const out = highlightLines(text.value, lang.value)
  if (typingHere.value) out[out.length - 1] += '<span class="caret"></span>'
  return out
})
/** Lines on screen (grows while the file is typed). */
const totalLines = computed(() => (path.value ? lines.value.length : 0))

const LANG_LABEL: Record<string, string> = { html: 'HTML', css: 'CSS', js: 'JavaScript', json: 'JSON', text: 'Plain Text' }

const statusText = computed(() => {
  const st = studio.status
  const t = s.value.status
  switch (st.kind) {
    case 'thinking': return t.thinking(who.value)
    case 'writing': return t.writing(who.value, st.file)
    case 'reading': return t.reading(who.value, st.file)
    case 'deleting': return t.deleting(who.value, st.file)
    case 'previewing': return t.previewing(who.value)
    case 'done': return t.done
    case 'error': return t.error
    default: return t.idle
  }
})

function icon(p: string): { label: string, color: string } {
  switch (extensionOf(p)) {
    case 'html': return { label: '<>', color: '#e44d26' }
    case 'css': return { label: '#', color: '#42a5f5' }
    case 'js': return { label: 'JS', color: '#f5d33d' }
    case 'json': return { label: '{}', color: '#c3a6ff' }
    case 'svg': return { label: '◇', color: '#ffb13b' }
    default: return { label: '≡', color: '#9aa4b2' }
  }
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

const canRun = computed(() => !!project.value && 'index.html' in project.value.files && !studio.busy)
function run() {
  const p = project.value
  if (!p || !canRun.value) return
  showStudioWindow('browser')
  void showPreview(p.id, 'index.html')
}

// Follow the caret while a file is being typed.
const scroller = ref<HTMLElement | null>(null)
watch(() => studio.typing?.shown, () => {
  if (!typingHere.value) return
  void nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
})
watch(path, () => { if (scroller.value && !typingHere.value) scroller.value.scrollTop = 0 })

watch(() => [project.value?.name, path.value], ([name, p]) => {
  setWindowTitle('code', name ? `${p ? `${baseName(p)} — ` : ''}${name}` : 'Code')
}, { immediate: true })
</script>

<template>
  <div class="code-app">
    <header class="tb" data-wf-drag>
      <div class="tb-title">
        <span class="tb-app">Code</span>
        <template v-if="project"><span class="tb-sep">—</span><span>{{ project.name }}</span></template>
      </div>
      <button class="tb-run" type="button" :disabled="!canRun" :title="s.run" @click="run">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>
        <span>{{ s.run }}</span>
      </button>
    </header>

    <div class="main">
      <aside class="side">
        <div class="side-h">{{ s.explorer }}</div>
        <template v-if="project">
          <div class="proj">
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
            <span>{{ project.slug }}</span>
          </div>
          <button
            v-for="f in files"
            :key="f"
            type="button"
            class="file"
            :class="{ on: f === path, typing: f === typingPath }"
            @click="openFile(f)"
          >
            <span class="ficon" :style="{ color: icon(f).color }">{{ icon(f).label }}</span>
            <span class="fname">{{ f }}</span>
            <span v-if="f === typingPath" class="fdot" />
          </button>
        </template>
        <div v-else class="side-empty">{{ s.noProject }}</div>

        <template v-if="projects.length > 1">
          <div class="side-h second">{{ s.projects }}</div>
          <button
            v-for="p in projects"
            :key="p.id"
            type="button"
            class="file proj-row"
            :class="{ on: p.id === project?.id }"
            :disabled="studio.busy"
            @click="openProject(p.id)"
          >
            <span class="ficon folder">▸</span>
            <span class="fname">{{ p.name }}</span>
          </button>
        </template>
      </aside>

      <section class="editor">
        <div class="tabs">
          <div v-for="t in tabs" :key="t" class="tab" :class="{ on: t === path }" @click="openFile(t)">
            <span class="ficon" :style="{ color: icon(t).color }">{{ icon(t).label }}</span>
            <span class="tname">{{ baseName(t) }}</span>
            <span v-if="t === typingPath" class="tdot" />
            <button v-else type="button" class="tclose" aria-label="Close" @click.stop="closeTab(t)">×</button>
          </div>
        </div>
        <template v-if="project && path">
          <div class="crumbs">{{ project.slug }} <span>›</span> {{ path }}</div>
          <div ref="scroller" class="code">
            <div v-for="(l, i) in lines" :key="i" class="ln">
              <span class="no">{{ i + 1 }}</span>
              <!-- highlightLines() escapes every character of the source. -->
              <span class="tx" v-html="l || ' '" />
            </div>
          </div>
        </template>
        <div v-else class="empty">
          <div class="empty-logo">
            <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 18L10 32l14 14M40 18l14 14-14 14" /></svg>
          </div>
          <p>{{ s.emptyHint }}</p>
          <ul><li v-for="e in s.emptyExamples" :key="e">{{ e }}</li></ul>
        </div>
      </section>
    </div>

    <footer class="status" :class="{ busy: studio.busy }">
      <span class="st-branch">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.6" /><circle cx="5" cy="12" r="1.6" /><circle cx="11" cy="6" r="1.6" /><path d="M5 5.6v4.8M11 7.6c0 2-2 2.4-6 2.8" /></svg>
        main
      </span>
      <span class="st-msg">
        <span v-if="studio.busy" class="spin" />
        {{ statusText }}
      </span>
      <span class="st-right">
        <template v-if="path">
          <span>{{ s.lines(totalLines) }}</span>
          <span>{{ LANG_LABEL[lang] }}</span>
          <span>UTF-8</span>
        </template>
        <span>{{ s.readOnly }}</span>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.code-app {
  --bg: #1e1f25;
  --side: #23252d;
  --line: #2f323c;
  --fg: #d6dae3;
  --dim: #8a92a3;
  --accent: #6aa7ff;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-size: 16px;
}
.tb {
  position: relative;
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px 0 120px;
  background: #2a2c34;
  border-bottom: 1px solid #15161a;
}
.tb-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #c9ced8;
  white-space: nowrap;
  pointer-events: none;
}
.tb-app { color: #fff; }
.tb-sep { color: var(--dim); font-weight: 400; }
.tb-run {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: #2f8f4e;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.tb-run:disabled { background: #3a3d47; color: #7f8696; cursor: default; }
.tb-run svg { width: 13px; height: 13px; fill: currentColor; }
.main { flex: 1; min-height: 0; display: flex; }
.side {
  width: 250px;
  flex: 0 0 250px;
  background: var(--side);
  border-right: 1px solid #17181d;
  overflow-y: auto;
  padding-bottom: 12px;
}
.side-h {
  padding: 14px 16px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
}
.side-h.second { margin-top: 14px; border-top: 1px solid var(--line); }
.proj { display: flex; align-items: center; gap: 4px; padding: 4px 12px; font-size: 14px; font-weight: 700; color: #c9ced8; text-transform: uppercase; letter-spacing: 0.03em; }
.proj svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 1.6; fill: none; }
.side-empty { padding: 6px 16px; font-size: 14px; color: var(--dim); }
.file {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px 5px 28px;
  border: none;
  background: none;
  color: #c9ced8;
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.file:hover { background: #2c2f38; }
.file.on { background: #37415a; color: #fff; }
.file:disabled { cursor: default; opacity: 0.6; }
.proj-row { padding-left: 16px; }
.ficon { width: 22px; flex: 0 0 22px; font: 700 11px ui-monospace, 'SF Mono', Menlo, monospace; text-align: center; }
.ficon.folder { color: var(--dim); font-size: 12px; }
.fname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fdot, .tdot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1s ease-in-out infinite; flex: none; }
.editor { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tabs { display: flex; height: 40px; flex: 0 0 40px; background: #24262e; border-bottom: 1px solid #17181d; overflow: hidden; }
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 12px;
  min-width: 120px;
  border-right: 1px solid #17181d;
  color: var(--dim);
  font-size: 14px;
  cursor: pointer;
}
.tab.on { background: var(--bg); color: #fff; box-shadow: inset 0 2px 0 var(--accent); }
.tname { flex: 1; white-space: nowrap; }
.tclose { width: 20px; height: 20px; border: none; border-radius: 4px; background: none; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; opacity: 0; }
.tab:hover .tclose, .tab.on .tclose { opacity: 0.8; }
.tclose:hover { background: #3a3d47; }
.crumbs { padding: 6px 18px; font-size: 13px; color: var(--dim); border-bottom: 1px solid #23252c; }
.crumbs span { margin: 0 4px; }
.code {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 0 40px;
  font: 15.5px/1.6 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  tab-size: 2;
}
.ln { display: flex; min-width: max-content; }
.ln:hover { background: rgba(255, 255, 255, 0.025); }
.no { width: 56px; flex: 0 0 56px; padding-right: 18px; text-align: right; color: #555b69; user-select: none; }
.tx { white-space: pre; padding-right: 24px; }
.tx :deep(.hl-c) { color: #6f7a8e; font-style: italic; }
.tx :deep(.hl-s) { color: #a8d886; }
.tx :deep(.hl-k) { color: #c792ea; }
.tx :deep(.hl-n) { color: #f78c6c; }
.tx :deep(.hl-f) { color: #82aaff; }
.tx :deep(.hl-t) { color: #f07178; }
.tx :deep(.hl-a) { color: #ffcb6b; }
.tx :deep(.hl-p) { color: #89ddff; }
.tx :deep(.hl-x) { color: #89a0c0; }
.tx :deep(.caret) {
  display: inline-block;
  width: 2px;
  height: 1.15em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: #7fb6ff;
  animation: blink 0.9s steps(2) infinite;
}
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--dim); text-align: center; padding: 40px; }
.empty-logo svg { width: 84px; height: 84px; stroke: #3d4250; stroke-width: 5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.empty p { max-width: 460px; margin: 8px 0 4px; font-size: 17px; line-height: 1.5; color: #aab1bf; }
.empty ul { list-style: none; margin: 0; padding: 0; font-size: 15px; line-height: 1.9; }
.status {
  height: 30px;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 14px;
  background: #2d5bd7;
  color: #fff;
  font-size: 13px;
  white-space: nowrap;
}
.status.busy { background: #7c4dd8; }
.st-branch { display: flex; align-items: center; gap: 5px; }
.st-branch svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.3; fill: none; }
.st-msg { display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; }
.st-right { margin-left: auto; display: flex; gap: 16px; opacity: 0.9; }
.spin { width: 11px; height: 11px; border: 2px solid rgba(255, 255, 255, 0.35); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; flex: none; }
@keyframes blink { 50% { opacity: 0; } }
@keyframes pulse { 50% { opacity: 0.35; } }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
