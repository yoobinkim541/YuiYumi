// Desktop implementation of the browser loop's host tools: computer_task goes to the local
// agent runtime (agent-runtime/, spawned by the shell; see docs/agent-runtime.md), open_url
// and open_app to the shell's system actions. Runs in the overlay window, which owns the
// controller (voice and character reactions); the agent panel window follows its session.

import { invoke } from '@tauri-apps/api/core'
import { HOST_APP_NAME_MAX, HOST_APPS_MAX, projectSubfolder, webUrl } from '@shared/contracts'
import type { ToolOutcome } from '@/connectors/registry'
import type { HostTools } from '@/agent/host-tools'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { AgentBridge, createAgentController, type AgentController, type AgentRuntimeEndpoint } from './agent-bridge'
import { listApps, openApp, openUrl } from './system'

const APPS_TTL_MS = 5 * 60 * 1000
const SUMMARY_MAX = 6000

/** Port and token of the runtime the shell spawned; the shell restarts it if it exited. */
export function runtimeEndpoint(): Promise<AgentRuntimeEndpoint> {
  return invoke<AgentRuntimeEndpoint>('agent_runtime_endpoint')
}

export function openAgentPanel(): void {
  void invoke('open_panel', { view: 'agent' }).catch(e => console.warn('[agent] panel', e))
}

export interface DesktopAgent {
  host: HostTools
  /** The controller once the runtime answered; null while it is not available. */
  controller: () => AgentController | null
  /** A request typed into the agent panel window. */
  ask: (text: string) => Promise<void>
}

export function createDesktopAgent(opts: { onSession: (id: string | null) => void }): DesktopAgent {
  const settings = useSettings()
  const persona = usePersona()
  let bridge: AgentBridge | null = null
  let controller: AgentController | null = null
  let unavailable = ''

  /** Connects (or reconnects after a runtime restart) and returns the controller. */
  async function ensure(): Promise<AgentController | null> {
    try {
      const ep = await runtimeEndpoint()
      if (bridge) bridge.retarget(ep)
      else {
        bridge = new AgentBridge(ep)
        controller = createAgentController({
          bridge,
          lang: () => settings.speechLang,
          permission: () => settings.permission,
          model: () => settings.agentModel,
          projectDir: () => settings.agentProjectDir || undefined,
          persona: () => ({ name: persona.activePersona.name, ...(persona.activePersona.speakingStyle ? { speakingStyle: persona.activePersona.speakingStyle } : {}) }),
          onSession: opts.onSession,
        })
      }
      unavailable = ''
      return controller
    } catch (e) {
      unavailable = String(e)
      console.warn('[agent] runtime unavailable:', unavailable)
      return null
    }
  }

  let apps: { at: number, names: string[] } | null = null
  async function appNames(): Promise<string[]> {
    if (apps && Date.now() - apps.at < APPS_TTL_MS) return apps.names
    const r = await listApps()
    const names = r.ok ? r.value.map(a => a.name.slice(0, HOST_APP_NAME_MAX)).filter(Boolean).slice(0, HOST_APPS_MAX) : []
    apps = { at: Date.now(), names }
    return names
  }

  async function computerTask(input: Record<string, unknown>): Promise<ToolOutcome> {
    if (!settings.agentProjectDir) {
      return { ok: false, error: 'No project folder is chosen yet. Ask the user to choose one in Settings > General > Agent project folder, then ask again.' }
    }
    const ctl = await ensure()
    if (!ctl) {
      return { ok: false, error: `The agent backend of this app is not installed or did not start (${unavailable}). Tell the user that the coding agent is not available in this build of the app.` }
    }
    const sub = projectSubfolder(input.project as string | undefined)
    const request = String(input.request)
      + (sub ? `\n\nWork inside the subfolder "${sub}" of the project folder (create it if it does not exist).` : '')
    openAgentPanel()
    const out = await ctl.run(request, { quiet: true })
    if (out.ok) {
      return { ok: true, data: { summary: out.text.slice(0, SUMMARY_MAX), spokenSummary: out.say || undefined, projectFolder: ctl.state.cwd ?? settings.agentProjectDir, ...(sub ? { subfolder: sub } : {}) } }
    }
    const lead = out.code === 'cancelled' ? 'The user stopped the task.'
      : out.code === 'no_project' ? 'The project folder is not usable. Ask the user to choose another one in Settings > General > Agent project folder.'
        : `The coding agent did not finish (${out.code}).`
    return { ok: false, error: `${lead} ${out.text}`.trim().slice(0, SUMMARY_MAX) }
  }

  const host: HostTools = {
    context: async () => ({ kind: 'desktop', apps: await appNames().catch(() => []) }),
    async run(name, input) {
      switch (name) {
        case 'computer_task': return computerTask(input)
        case 'open_url': {
          const url = webUrl(String(input.url))
          if (!url) return { ok: false, error: 'Only http and https web addresses can be opened.' }
          const r = await openUrl(url)
          return r.ok ? { ok: true, data: { opened: r.value } } : { ok: false, error: r.error }
        }
        case 'open_app': {
          const r = await openApp(String(input.name))
          return r.ok ? { ok: true, data: { opened: r.value } } : { ok: false, error: r.error }
        }
      }
    },
  }

  async function ask(text: string): Promise<void> {
    const ctl = await ensure()
    if (ctl) await ctl.ask(text)
  }

  // Start connecting right away so the first task does not wait for the runtime.
  void ensure()

  return { host, controller: () => controller, ask }
}
