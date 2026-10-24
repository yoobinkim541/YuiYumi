// Runs the studio tools against the in-memory file system. The UI side effects (typing
// animation, status line, browser window) come in through StudioUi so this stays testable.

import type { StudioToolName } from '@shared/studio'
import type { StudioToolOutcome } from './loop'
import { createProject, deleteFile, getProject, listFiles, readFile, writeFile, type StudioProject, type VfsState } from './vfs'

export interface StudioUi {
  /** A project became current (new or existing). */
  onProject?: (p: StudioProject) => void
  onWrite?: (p: StudioProject, path: string) => void
  onRead?: (p: StudioProject, path: string) => void
  onDelete?: (p: StudioProject, path: string) => void
  /** Opens the browser window on the project; resolves with runtime errors seen on load. */
  openPreview: (p: StudioProject, entry: string) => Promise<{ errors: string[] }>
}

export interface StudioWorkspace {
  vfs: VfsState
  /** Current project id (start_project replaces it). */
  currentId: string | null
}

export const previewAddress = (p: StudioProject, entry = 'index.html') =>
  `yuiyumi.local/${p.slug}${entry === 'index.html' ? '' : `/${entry}`}`

/** One-line description of the current project for the model's <context>. */
export function describeProject(p: StudioProject | undefined): string {
  if (!p || Object.keys(p.files).length === 0) return 'No current project.'
  const files = listFiles(p).map(f => `${f.path} (${f.bytes} B)`).join(', ')
  return `Current project: "${p.name}" at ${previewAddress(p)}. Files: ${files}.`
}

export function createStudioExecutor(ws: StudioWorkspace, ui: StudioUi) {
  const current = (): StudioProject | undefined => getProject(ws.vfs, ws.currentId)

  /** Files written before start_project land in an auto-created project. */
  function ensureProject(): StudioProject {
    const p = current()
    if (p) return p
    const created = createProject(ws.vfs, 'App')
    ws.currentId = created.id
    ui.onProject?.(created)
    return created
  }

  return async function exec(name: Exclude<StudioToolName, 'finish'>, input: Record<string, unknown>): Promise<StudioToolOutcome> {
    const str = (k: string) => String(input[k] ?? '')
    switch (name) {
      case 'start_project': {
        const p = createProject(ws.vfs, str('name'))
        ws.currentId = p.id
        ui.onProject?.(p)
        return { ok: true, data: { project: p.name, address: previewAddress(p) } }
      }
      case 'write_file': {
        const p = ensureProject()
        const r = writeFile(p, str('path'), str('content'))
        if (!r.ok) return { ok: false, error: r.error }
        ui.onWrite?.(p, str('path'))
        return { ok: true, data: { path: str('path'), bytes: r.value.bytes, created: r.value.created } }
      }
      case 'read_file': {
        const p = current()
        if (!p) return { ok: false, error: 'No current project.' }
        const r = readFile(p, str('path'))
        if (!r.ok) return { ok: false, error: r.error }
        ui.onRead?.(p, str('path'))
        return { ok: true, data: { path: str('path'), content: r.value } }
      }
      case 'list_files': {
        const p = current()
        if (!p) return { ok: true, data: { project: null, files: [] } }
        return { ok: true, data: { project: p.name, files: listFiles(p) } }
      }
      case 'delete_file': {
        const p = current()
        if (!p) return { ok: false, error: 'No current project.' }
        const r = deleteFile(p, str('path'))
        if (!r.ok) return { ok: false, error: r.error }
        ui.onDelete?.(p, str('path'))
        return { ok: true, data: { deleted: str('path') } }
      }
      case 'open_preview': {
        const p = current()
        const entry = str('entry') || 'index.html'
        if (!p) return { ok: false, error: 'No current project. Write the files first.' }
        if (!(entry in p.files)) return { ok: false, error: `No such file: ${entry}. Write it first.` }
        const { errors } = await ui.openPreview(p, entry)
        if (errors.length) {
          return { ok: false, error: `The page opened at ${previewAddress(p, entry)} but reported runtime errors:\n${errors.map(e => `- ${e}`).join('\n')}` }
        }
        return { ok: true, data: { opened: previewAddress(p, entry), runtimeErrors: 0 } }
      }
    }
  }
}
