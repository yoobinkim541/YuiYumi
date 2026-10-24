// Settings and dashboard windows. The desktop shell mounts SettingsApp / DashboardApp as
// windows. Dev preview from the browser console:
//   (await import('/src/settings/index.ts')).mountSettingsPreview('dashboard')

import { getActivePinia, createPinia } from 'pinia'
import { createApp, type Component } from 'vue'
import DashboardApp from './DashboardApp.vue'
import SettingsApp from './SettingsApp.vue'

export { DashboardApp, SettingsApp }

let previewEl: HTMLElement | null = null

/** Dev helper: mounts the settings or dashboard over the page in a fixed-size box. */
export function mountSettingsPreview(which: 'settings' | 'dashboard', size = { w: 1000, h: 700 }): void {
  if (previewEl) previewEl.remove()
  const host = document.createElement('div')
  host.id = 'yy-settings-preview'
  host.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:${size.w}px;height:${size.h}px;z-index:99999;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgb(0 0 0 / .45)`
  document.body.appendChild(host)
  const comp: Component = which === 'settings' ? SettingsApp : DashboardApp
  createApp(comp).use(getActivePinia() ?? createPinia()).mount(host)
  previewEl = host
}

