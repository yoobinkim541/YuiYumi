// Settings and dashboard panel windows: the web app's SettingsApp / DashboardApp in a normal
// window. Stores are shared with the overlay through sync.ts; voice and nunchi status are
// mirrored from it (vite.config.ts points these components' '@/voice' and '@/nunchi'
// imports at src/desktop-app/panel/ in the desktop build).

import { createPinia } from 'pinia'
import { createApp, defineAsyncComponent, h } from 'vue'
import { useCharacterStore } from '@/character'
import { refreshStatus } from '@/connectors/live'
import { nunchiStatus } from '@/nunchi'
import { activity } from '@/settings/activity'
import { useDemo } from '@/stores/demo'
import { usePersona } from '@/stores/persona'
import { useSettings } from '@/stores/settings'
import { voiceState } from '@/voice'
import { installApiAuth } from './auth'
import { receiveRuntime, syncStores } from './sync'

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
