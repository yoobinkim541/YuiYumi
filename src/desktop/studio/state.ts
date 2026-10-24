// Reactive state of the virtual coding studio, shared by the Code and Browser apps and the
// task runner: projects (persisted to localStorage), the editor view, the typing animation
// queue and the browser preview.

import { reactive, watch } from 'vue'
import { buildSrcdoc } from './srcdoc'
import { getProject, loadState, saveState, sortedPaths, type StudioProject, type VfsState } from './vfs'

export type StudioStatus =
  | { kind: 'idle' | 'thinking' | 'previewing' | 'done' | 'error' }
  | { kind: 'writing' | 'reading' | 'deleting', file: string }

export type PreviewState =
  | { kind: 'project', projectId: string, entry: string, seq: number, srcdoc: string }
  | { kind: 'url', url: string, seq: number }

const storage = typeof localStorage === 'undefined' ? undefined : localStorage

export const studio = reactive({
  vfs: loadState(storage) as VfsState,
  /** Project shown in the Code app (and the "current project" of the next task). */
  activeId: null as string | null,
  openTabs: [] as string[],
  activePath: null as string | null,
  /** `${projectId}/${path}` keys of written files still waiting for their typing animation. */
  pending: {} as Record<string, true>,
  typing: null as null | { projectId: string, path: string, shown: number },
  status: { kind: 'idle' } as StudioStatus,
  /** A task is running. */
  busy: false,
  preview: null as PreviewState | null,
  /** Runtime errors reported by the current preview. */
  previewErrors: [] as string[],
  /** seq of the preview that finished loading. */
  previewReady: 0,
  /** Task timeline for diagnostics (ms since the task started). */
  timeline: [] as { t: number, what: string }[],
})

// Last restored project is shown first.
studio.activeId = studio.vfs.projects[studio.vfs.projects.length - 1]?.id ?? null
if (studio.activeId) openProject(studio.activeId)

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(() => studio.vfs.projects, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveState(storage, studio.vfs), 400)
}, { deep: true })

let taskStart = 0
export function markTimeline(what: string, reset = false): void {
  const now = performance.now()
  if (reset) { taskStart = now; studio.timeline = [] }
  studio.timeline.push({ t: Math.round(now - taskStart), what })
}

export function activeProject(): StudioProject | undefined {
  return getProject(studio.vfs, studio.activeId)
}

export const pendingKey = (projectId: string, path: string) => `${projectId}/${path}`

/** Shows a project in the Code app with its main files as tabs. */
export function openProject(id: string): void {
  const p = getProject(studio.vfs, id)
  if (!p) return
  studio.activeId = id
  const paths = sortedPaths(p).filter(path => !studio.pending[pendingKey(id, path)])
  studio.openTabs = paths.slice(0, 6)
  studio.activePath = paths[0] ?? null
}

export function openFile(path: string): void {
  if (!studio.openTabs.includes(path)) studio.openTabs.push(path)
  studio.activePath = path
}

export function closeTab(path: string): void {
  const i = studio.openTabs.indexOf(path)
  if (i < 0) return
  studio.openTabs.splice(i, 1)
  if (studio.activePath === path) studio.activePath = studio.openTabs[Math.min(i, studio.openTabs.length - 1)] ?? null
}

// ---------------------------------------------------------------------------
// Typing animation: written files are typed out one after another while the loop goes on.

export const timing = {
  /** Skip the animation (tests). */
  instant: import.meta.env.MODE === 'test',
  tickMs: 33,
  /** A file takes about this long, at least minCps characters per second. */
  fileMs: 3200,
  minCps: 380,
}

const queue: { projectId: string, path: string }[] = []
let running: Promise<void> | null = null
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function enqueueTyping(projectId: string, path: string): void {
  studio.pending[pendingKey(projectId, path)] = true
  queue.push({ projectId, path })
  kick()
}

function kick(): void {
  if (running) return
  running = runQueue().finally(() => {
    running = null
    if (queue.length) kick()
  })
}

async function runQueue(): Promise<void> {
  while (queue.length) {
    const job = queue.shift()!
    const p = getProject(studio.vfs, job.projectId)
    delete studio.pending[pendingKey(job.projectId, job.path)]
    if (!p || !(job.path in p.files)) continue
    if (studio.activeId !== job.projectId) openProject(job.projectId)
    openFile(job.path)
    studio.status = { kind: 'writing', file: job.path }
    markTimeline(`type ${job.path}`)
    if (!timing.instant) {
      studio.typing = { projectId: job.projectId, path: job.path, shown: 0 }
      const len0 = p.files[job.path]!.length
      const perTick = Math.max(1, Math.ceil(Math.max(timing.minCps, len0 / (timing.fileMs / 1000)) * timing.tickMs / 1000))
      while (studio.typing) {
        const full = p.files[job.path] ?? ''
        const next = Math.min(full.length, studio.typing.shown + perTick)
        studio.typing.shown = next
        if (next >= full.length) break
        await sleep(timing.tickMs)
      }
      studio.typing = null
    }
  }
}

/** Resolves when every queued file has been typed out. */
export async function drainTyping(): Promise<void> {
  while (running) await running
}

/** Text of a file as the editor shows it right now (partial while typing). */
export function visibleContent(projectId: string, path: string): string {
  const full = getProject(studio.vfs, projectId)?.files[path] ?? ''
  const t = studio.typing
  return t && t.projectId === projectId && t.path === path ? full.slice(0, t.shown) : full
}

// ---------------------------------------------------------------------------
// Browser preview

let previewSeq = 0
const PREVIEW_SETTLE_MS = 700
const PREVIEW_TIMEOUT_MS = 4000

/** Loads a project into the browser window; resolves with the runtime errors seen on load. */
export async function showPreview(projectId: string, entry = 'index.html'): Promise<{ errors: string[] }> {
  const p = getProject(studio.vfs, projectId)
  if (!p) return { errors: [] }
  const seq = ++previewSeq
  studio.previewErrors = []
  studio.preview = { kind: 'project', projectId, entry, seq, srcdoc: buildSrcdoc(p.files, entry) }
  if (timing.instant) return { errors: [] }
  const start = performance.now()
  while (studio.previewReady !== seq && performance.now() - start < PREVIEW_TIMEOUT_MS) await sleep(50)
  await sleep(PREVIEW_SETTLE_MS)
  return { errors: studio.preview?.seq === seq ? [...studio.previewErrors] : [] }
}

/** Reloads the current preview from the project's latest files. */
export function reloadPreview(): void {
  const pv = studio.preview
  if (!pv) return
  if (pv.kind === 'url') { studio.preview = { ...pv, seq: ++previewSeq }; return }
  void showPreview(pv.projectId, pv.entry)
}

/** Opens a web address in the browser window (many sites refuse to be framed). */
export function showUrl(url: string): void {
  studio.previewErrors = []
  studio.preview = { kind: 'url', url, seq: ++previewSeq }
}

export function previewSeqOf(): number {
  return studio.preview?.seq ?? 0
}
