// Virtual coding studio for the web demo: builds small apps inside the virtual PC (code
// editor + browser preview) when the real agent runtime of the desktop app is not there.
// Track W's computer_task tool calls runStudioTask on the web and reports the summary back
// through the main agent loop (which speaks it).

import { requiresConfirmation, type AgentModel, type ConnectorOpName, type PermissionLevel } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { bus } from '@/core/bus'
import { useConfirmQueue } from '@/agent/confirm-queue'
import { useSettings } from '@/stores/settings'
import { playBuiltin } from '@/voice'
import { createStudioExecutor, describeProject, type StudioWorkspace } from './executor'
import { createStudioStepClient, runStudioLoop, StudioStepError, type StudioLoopResult } from './loop'
import { clearStudioStage, showStudioWindow } from './stage'
import { activeProject, drainTyping, enqueueTyping, markTimeline, openFile, openProject, showPreview, studio } from './state'
import { studioStrings } from './strings'
import { getProject } from './vfs'

export interface StudioTaskOptions {
  lang: Lang
  model: AgentModel
  permission: PermissionLevel
  signal?: AbortSignal
}

export interface StudioTaskResult {
  ok: boolean
  /** One or two sentences for the agent loop to report back (user's language). */
  summary: string
}

export { studio } from './state'

/** Whether the main agent loop already marked itself busy (then it also clears it). */
let agentBusy = false
bus.on('agent:busy', ({ busy }) => { agentBusy = busy })

const step = createStudioStepClient()

/** Title for the confirm card: the request, trimmed to one short line. */
export function cardTitle(request: string): string {
  const one = request.replace(/\s+/g, ' ').trim()
  return one.length > 80 ? `${one.slice(0, 79)}…` : one
}

function failureSummary(result: Extract<StudioLoopResult, { ok: false }>, lang: Lang): string {
  const f = studioStrings(lang).failed
  if (result.cause === 'aborted') return f.aborted
  if (result.cause === 'max_steps') return f.incomplete
  const e = result.error
  if (e instanceof StudioStepError && e.code === 'budget') return f.budget
  return f.offline
}

/** Runs a coding/computer task on the virtual PC: confirm, build with the model, preview. */
export async function runStudioTask(request: string, opts: StudioTaskOptions): Promise<StudioTaskResult> {
  const s = studioStrings(opts.lang)
  if (studio.busy) return { ok: false, summary: s.failed.busy }
  studio.busy = true
  markTimeline('start', true)
  let ownBusy = false
  let previewed = false

  try {
    showStudioWindow('code')
    studio.status = { kind: 'idle' }

    // Files in the virtual studio are local and reversible: 'write' grade.
    if (requiresConfirmation('write', opts.permission)) {
      playBuiltin('confirm')
      const accepted = await useConfirmQueue().requestConfirm({
        kind: 'write',
        // Not a connector op: the card shows unknown ops as their label.
        op: s.confirmOp as ConnectorOpName,
        grade: 'write',
        fields: [{ field: 'title', value: cardTitle(request) }],
      })
      bus.emit('character:node', { node: 'working' })
      markTimeline(accepted ? 'confirmed' : 'declined')
      if (!accepted) return { ok: false, summary: s.failed.declined }
    }
    if (opts.signal?.aborted) return { ok: false, summary: s.failed.aborted }

    ownBusy = !agentBusy
    if (ownBusy) bus.emit('agent:busy', { busy: true })
    bus.emit('character:node', { node: 'working' })
    bus.emit('character:react', { emotion: 'happy', line: s.startLine, source: 'agent' })

    const ws: StudioWorkspace = { vfs: studio.vfs, currentId: studio.activeId }
    const exec = createStudioExecutor(ws, {
      onProject: (p) => {
        openProject(p.id)
        markTimeline(`project ${p.slug}`)
      },
      onWrite: (p, path) => {
        markTimeline(`write ${path}`)
        enqueueTyping(p.id, path)
      },
      onRead: (p, path) => {
        if (studio.activeId !== p.id) openProject(p.id)
        openFile(path)
        studio.status = { kind: 'reading', file: path }
      },
      onDelete: (p, path) => {
        studio.status = { kind: 'deleting', file: path }
        const i = studio.openTabs.indexOf(path)
        if (i >= 0 && studio.activeId === p.id) studio.openTabs.splice(i, 1)
      },
      openPreview: async (p, entry) => {
        // The code is shown being typed first; the browser opens when it is all on screen.
        await drainTyping()
        studio.status = { kind: 'previewing' }
        showStudioWindow('browser')
        markTimeline('preview')
        previewed = true
        const r = await showPreview(p.id, entry)
        markTimeline(`preview ready (${r.errors.length} errors)`)
        return r
      },
    })

    const result = await runStudioLoop(request, {
      step,
      exec,
      lang: opts.lang,
      sessionId: useSettings().sessionId,
      model: opts.model,
      signal: opts.signal,
      context: () => describeProject(activeProject()),
      onStep: (n, phase) => {
        markTimeline(`step ${n} ${phase}`)
        if (phase === 'start') {
          if (!studio.typing) studio.status = { kind: 'thinking' }
          bus.emit('thinking', { on: true })
        } else {
          bus.emit('thinking', { on: false })
        }
      },
    })
    await drainTyping()

    // Whatever got built is shown, even when the model stopped early.
    const built = getProject(studio.vfs, ws.currentId)
    if (!previewed && built && 'index.html' in built.files && !opts.signal?.aborted) {
      showStudioWindow('browser')
      await showPreview(built.id, 'index.html')
      previewed = true
    }
    markTimeline(`end ${result.ok ? 'ok' : result.cause}`)

    if (!result.ok) {
      console.warn('[studio] task failed', result.cause, result.error)
      studio.status = { kind: 'error' }
      return { ok: false, summary: failureSummary(result, opts.lang) }
    }
    studio.status = { kind: 'done' }
    return { ok: true, summary: result.summary || s.doneSummary }
  } catch (e) {
    console.warn('[studio] task error', e)
    studio.status = { kind: 'error' }
    return { ok: false, summary: s.failed.offline }
  } finally {
    bus.emit('thinking', { on: false })
    if (ownBusy) {
      bus.emit('agent:busy', { busy: false })
      bus.emit('character:node', { node: 'idle' })
    }
    clearStudioStage()
    studio.busy = false
  }
}
