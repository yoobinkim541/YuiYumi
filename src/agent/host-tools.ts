// Host tools of the browser loop (computer_task, open_url, open_app; see HOST_TOOLS in
// shared/contracts.ts). The web demo implementation is here: computer_task goes to the
// virtual coding studio, open_url opens a browser tab, open_app focuses a virtual desktop
// app. The desktop app swaps in its own implementation (src/desktop-app/agent-host.ts) with
// setHostTools before the first task.

import { projectSubfolder, webUrl, type AgentModel, type HostContext, type HostToolName, type PermissionLevel } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { ToolOutcome } from '@/connectors/registry'
import { focusWindow, type AppId } from '@/desktop/windows'
import type { ConfirmCardInput } from './confirm-queue'
import { AGENT_STRINGS } from './strings'

export interface HostToolDeps {
  lang: () => Lang
  model: () => AgentModel
  permission: () => PermissionLevel
  confirm: (card: ConfirmCardInput) => Promise<boolean>
}

export interface HostTools {
  /** Sent with every step: decides the tool descriptions on the server. */
  context: () => Promise<HostContext>
  run: (name: HostToolName, input: Record<string, unknown>, deps: HostToolDeps) => Promise<ToolOutcome>
}

/** Tool error the loop turns into a short spoken line in the user's language. */
export const NEEDS_DESKTOP = 'This needs the YuiYumi desktop app, which can work on files and run commands on your computer.'

// ---------------------------------------------------------------------------
// Web demo

/** Names the user may say for each virtual desktop app (lowercase, no spaces). */
const VIRTUAL_APPS: Partial<Record<AppId, string[]>> = {
  mail: ['mail', 'email', 'gmail', 'inbox', 'メール', '메일', '이메일', '邮件', '郵件', '信箱'],
  calendar: ['calendar', 'googlecalendar', 'schedule', 'カレンダー', '캘린더', '달력', '일정', '日历', '行事曆', '日曆'],
  slack: ['slack', 'スラック', '슬랙'],
  discord: ['discord', 'ディスコード', '디스코드'],
  drive: ['drive', 'googledrive', 'files', 'ドライブ', '드라이브', '云端硬盘', '雲端硬碟'],
  settings: ['settings', 'preferences', 'yuiyumisettings', '設定', '설정', '设置'],
  dashboard: ['dashboard', 'yuiyumidashboard', 'ダッシュボード', '대시보드', '仪表盘', '儀表板'],
}

const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, '').replace(/\.app$/, '')

export function virtualAppFor(name: string): AppId | null {
  const q = norm(name)
  if (!q) return null
  for (const [id, names] of Object.entries(VIRTUAL_APPS) as [AppId, string[]][]) {
    if (names.includes(q) || q === id) return id
  }
  return null
}

/** window.open without a user gesture is often blocked: then a card asks, and its click opens the tab. */
async function openTab(url: string, deps: HostToolDeps): Promise<ToolOutcome> {
  const w = window.open('about:blank', '_blank')
  if (w) {
    w.opener = null
    w.location.href = url
    return { ok: true, data: { opened: url } }
  }
  const host = new URL(url).host
  const accepted = await deps.confirm({ kind: 'suggestion', request: url, summary: AGENT_STRINGS[deps.lang()].openTab(host), timeoutMs: 30_000 })
  if (!accepted) return { ok: true, data: { opened: false, note: 'The browser blocked the new tab and the user did not open it from the card.' } }
  window.open(url, '_blank', 'noopener')
  return { ok: true, data: { opened: url } }
}

/** Opens our YouTube page in the virtual Browser app and plays the best curated match. */
async function openVirtualYoutube(videoId: string | null, query: string): Promise<ToolOutcome> {
  const [{ matchVideo, TUBE_VIDEOS }, { showYoutube }, { showStudioWindow }] = await Promise.all([
    import('@/desktop/studio/youtube'), import('@/desktop/studio/state'), import('@/desktop/studio/stage'),
  ])
  const known = videoId ? TUBE_VIDEOS.find(v => v.id === videoId) : undefined
  const pick = known ?? (query ? matchVideo(query) : null)
  showYoutube(videoId ?? pick?.id ?? null, query)
  showStudioWindow('browser')
  return { ok: true, data: { opened: 'YouTube in the virtual browser', playing: pick?.title ?? (videoId ? videoId : null), note: pick || videoId ? undefined : 'Showing the YouTube home page; no search is available, so name a song or topic to play.' } }
}

export const webHostTools: HostTools = {
  context: async () => ({ kind: 'web' }),
  async run(name, input, deps) {
    switch (name) {
      case 'computer_task': {
        const sub = projectSubfolder(input.project as string | undefined)
        const request = String(input.request) + (sub ? `\n\nProject name: ${sub}` : '')
        // Track S's studio; the import keeps it out of bundles that never call it.
        const { runStudioTask } = await import('@/desktop/studio')
        const r = await runStudioTask(request, { lang: deps.lang(), model: deps.model(), permission: deps.permission() })
        if (!r.ok && r.summary === 'studio_unavailable') return { ok: false, error: NEEDS_DESKTOP }
        return r.ok ? { ok: true, data: { summary: r.summary } } : { ok: false, error: r.summary || 'The studio could not finish the task.' }
      }
      case 'open_url': {
        const url = webUrl(String(input.url))
        if (!url) return { ok: false, error: 'Only http and https web addresses can be opened.' }
        // YouTube plays inside the virtual PC's browser (its embed player can be framed).
        const yt = (await import('@/desktop/studio/youtube')).parseYoutubeUrl(url)
        if (yt) return openVirtualYoutube(yt.videoId, yt.query)
        return openTab(url, deps)
      }
      case 'open_app': {
        if ((await import('@/desktop/studio/youtube')).isYoutubeAppName(String(input.name))) return openVirtualYoutube(null, '')
        const id = virtualAppFor(String(input.name))
        if (!id) return { ok: false, error: `"${String(input.name)}" is not on this virtual computer (mail, calendar, slack, discord, drive, settings, dashboard). ${NEEDS_DESKTOP}` }
        focusWindow(id)
        return { ok: true, data: { opened: id } }
      }
    }
  },
}

// ---------------------------------------------------------------------------

let current: HostTools = webHostTools

export function setHostTools(tools: HostTools): void {
  current = tools
}

/** The active implementation, looked up per call so a later setHostTools applies. */
export const hostTools: HostTools = {
  context: () => current.context(),
  run: (name, input, deps) => current.run(name, input, deps),
}
