// Connector sign-in for the desktop app. The webview has no cookies on the API origin, so the
// sealed token blobs (one per provider, kept in the macOS Keychain by src-tauri/src/auth.rs)
// travel as `Authorization: Bearer <blob>,<blob>` on the live connector calls.
//
// Sign-in: the connect buttons navigate to /api/auth/<provider>/start; the shell intercepts that
// navigation and runs the system-browser flow with a loopback redirect instead. Sign-out: the
// server-side logout carries the bearer; once it answers, the provider's blob is forgotten.

import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { API_BASE, isApiUrl } from '@/core/api'
import { setLiveAuthHeader } from '@/connectors/live-client'

let blobs: string[] = []

async function reload(): Promise<void> {
  blobs = await invoke<string[]>('auth_blobs').catch(() => [])
}

/** Installs the bearer; `onChange` runs after a sign-in or sign-out in any window. */
export async function installApiAuth(onChange: () => void): Promise<void> {
  // Sign-in links that resolve to the app's own origin are rebased onto the API server.
  await invoke('set_api_base', { base: API_BASE || location.origin }).catch(() => {})
  await reload()
  setLiveAuthHeader(() => (blobs.length ? `Bearer ${blobs.join(',')}` : null))
  void listen('yy://auth', async () => { await reload(); onChange() })

  const base = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await base(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const logout = isApiUrl(url) ? /\/api\/auth\/([a-z]+)\/logout$/.exec(new URL(url, location.href).pathname) : null
    if (logout && res.ok) {
      await invoke('auth_clear', { provider: logout[1] }).catch(() => {})
      void emit('yy://auth', { provider: logout[1], ok: false, account: null, error: null })
    }
    return res
  }
}
