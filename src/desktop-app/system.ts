// Desktop-only system actions for the assistant: open a website in the default browser,
// launch an installed app, list installed apps. Outside the desktop app every call returns
// { ok: false, error: 'unsupported' } (the web build acts on the virtual desktop instead).

import { invoke } from '@tauri-apps/api/core'
import { inTauri } from './tauri'

export type SystemResult<T> = { ok: true, value: T } | { ok: false, error: string }

export interface InstalledApp {
  /** Localized display name, as Finder shows it. */
  name: string
  bundleId: string | null
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<SystemResult<T>> {
  if (!inTauri()) return { ok: false, error: 'unsupported' }
  try {
    return { ok: true, value: await invoke<T>(cmd, args) }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Opens an http(s) URL in the default browser. Value: the normalized URL. */
export function openUrl(url: string): Promise<SystemResult<string>> {
  return call<string>('open_url', { url })
}

/**
 * Launches an installed app by display name or bundle id ("Safari", "slack", "캘린더",
 * "com.apple.iCal"); case, spaces and punctuation are ignored. Value: the resolved app name.
 */
export function openApp(name: string): Promise<SystemResult<string>> {
  return call<string>('open_app', { name })
}

/** Installed apps in /Applications, /System/Applications and ~/Applications. */
export function listApps(): Promise<SystemResult<InstalledApp[]>> {
  return call<InstalledApp[]>('list_apps')
}

export const systemActionsAvailable = inTauri
