// Settings, dashboard and agent panel windows. Settings/dashboard: the web app's SettingsApp /
// DashboardApp in a normal window. Stores are shared with the overlay through sync.ts; voice
// and nunchi status are mirrored from it (vite.config.ts points these components' '@/voice'
// and '@/nunchi' imports at src/desktop-app/panel/ in the desktop build). Agent: AgentPanel
// following the overlay's agent runtime session; requests typed here go to the overlay.

import { createPinia } from 'pinia'
import { createApp, defineAsyncComponent, h, watch } from 'vue'
import { useCharacterStore } from '@/character'
import { refreshStatus } from '@/connectors/live'
import { nunchiStatus } from '@/nunchi'
import { activity } from '@/settings/activity'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { voiceState } from '@/voice'
import { AgentBridge, createAgentController, type AgentController } from './agent-bridge'
import { runtimeEndpoint } from './agent-host'
import AgentPanel from './AgentPanel.vue'
import { installApiAuth } from './auth'
import { receiveRuntime, sendCommand, syncStores } from './sync'

export async function mountPanel(view: 'settings' | 'dashboard'): Promise<void> {
  document.documentElement.classList.add('yy-panel')
  await installApiAuth(() => void refreshStatus())
  const Panel = defineAsyncComponent(() => (view === 'settings' ? import('@/settings/SettingsApp.vue') : import('@/settings/DashboardApp.vue')))
  const app = createApp({ render: () => h(Panel) })
  app.use(createPinia())
  syncStores([useSettings(), useCharacterStore(), usePersona(), useDemo()])
  receiveRuntime((r) => {
    Object.assign(voiceState, r.voice)
    Object.assign(nunchiStatus, r.nunchi)
    Object.assign(activity, r.activity)
  })
  app.mount('#app')
}

export async function mountAgentPanel(): Promise<void> {
  document.documentElement.classList.add('yy-panel')
  for (const el of [document.documentElement, document.body, document.getElementById('app')]) {
    if (el) Object.assign(el.style, { height: '100%', background: '#fff' })
  }
  const pinia = createPinia()
  const app = createApp({ render: () => h(AgentPanel, { controller: view, lang: settings.lang }) })
  app.use(pinia)
  const settings = useSettings(pinia)
  syncStores([settings, useCharacterStore(pinia), usePersona(pinia)])

  const endpoint = await runtimeEndpoint().catch(() => null)
  const bridge = new AgentBridge(endpoint ?? { port: 0, token: '' })
  // Mirrors the overlay's session; the overlay's controller speaks and moves the character.
  const controller = createAgentController({
    bridge,
    emit: () => {},
    lang: () => settings.lang,
    permission: () => settings.permission,
    model: () => settings.agentModel,
    projectDir: () => settings.agentProjectDir || undefined,
    persona: () => undefined,
  })
  const localError = (code: 'no_project' | 'offline') => {
    controller.state.items.push({ kind: 'error', id: `local-${Date.now()}`, code, text: controller.strings().errors[code] ?? code })
  }
  const view: AgentController = {
    ...controller,
    ask: async (text: string) => {
      if (!settings.agentProjectDir) return localError('no_project')
      await sendCommand({ agentAsk: text })
    },
  }
  if (!endpoint) localError('offline')

  receiveRuntime((r) => {
    if (r.agentSession === undefined || r.agentSession === controller.state.sessionId) return
    const id = r.agentSession
    // A restarted runtime has a new port and token.
    void runtimeEndpoint().then(ep => bridge.retarget(ep), () => {}).finally(() => controller.attach(id))
  })
  watch(() => settings.lang, () => { document.title = controller.strings().title }, { immediate: true })
  app.mount('#app')
}
