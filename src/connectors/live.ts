// Live connector state: which services run on the user's connected accounts, and the
// startup / reconnect load that mirrors their data into the demo store. A service that is
// not connected, or whose load fails, stays on the mock data (AC-8).

import { reactive } from 'vue'
import {
  LIVE_SAMPLES_ADD_OP, LIVE_SAMPLES_REMOVE_OP, LIVE_SERVICE_LIST, LIVE_SNAPSHOT_OP, PROVIDER_OF,
  type AuthStatus, type ConnectorService, type LiveProvider, type LiveService,
} from '@shared/contracts'
import { DEFAULT_LANG, type Lang } from '@shared/languages'
import { buildDemoData } from '@/desktop/seed'
import { useDemo } from '@/stores/demo'
import { useSettings } from '@/stores/settings'
import { callLive, fetchAuthStatus, LiveConnectorError, logoutProvider } from './live-client'
import type { DemoStore } from './types'

/** Services whose ops go to /api/connectors/<service>. Set from /api/auth/status at runtime. */
export const LIVE_SERVICES: Partial<Record<ConnectorService, boolean>> = reactive({})

export type LiveSyncStatus = 'mock' | 'loading' | 'live' | 'error'

export const liveState = reactive({
  /** /api/auth/status answered (or failed) at least once. */
  checked: false,
  status: null as AuthStatus | null,
  services: Object.fromEntries(LIVE_SERVICE_LIST.map(s => [s, 'mock'])) as Record<LiveService, LiveSyncStatus>,
  errors: {} as Partial<Record<LiveService, string>>,
  /** Result of the last OAuth redirect back to the app (?connected= / ?connect_error=). */
  redirect: null as null | { provider: LiveProvider, ok: boolean, reason?: string },
  /** Sample data action in progress / last outcome. */
  samples: { busy: false, last: null as null | { ok: boolean, added?: number, removed?: number, error?: string } },
})

export const isLiveService = (s: string): s is LiveService => (LIVE_SERVICE_LIST as string[]).includes(s)

interface Deps {
  demo?: DemoStore
  sessionId?: string
  lang?: Lang
  fetchImpl?: typeof fetch
  now?: () => Date
}

function resolve(d: Deps) {
  let settings: { sessionId: string, lang: Lang } = { sessionId: '', lang: DEFAULT_LANG }
  if (!d.sessionId || !d.lang) {
    try { settings = useSettings() } catch { /* no settings store (tests): defaults */ }
  }
  return {
    demo: d.demo ?? useDemo(),
    sessionId: d.sessionId ?? settings.sessionId,
    lang: d.lang ?? settings.lang,
    fetchImpl: d.fetchImpl,
    now: d.now ?? (() => new Date()),
  }
}

/** Visible calendar range for the initial load: yesterday through next week (local days). */
function calendarRange(now: Date) {
  const day = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toISOString()
  return { from: day(-1), to: day(8) }
}

/** Puts a service back on the mock data (demo content in the current language). */
export function useMock(service: LiveService, deps: Deps = {}, error?: string): void {
  const { demo, lang, now } = resolve(deps)
  LIVE_SERVICES[service] = false
  liveState.services[service] = error ? 'error' : 'mock'
  if (error) liveState.errors[service] = error
  else delete liveState.errors[service]
  if (!demo.live[service]) return
  demo.setLive(service, false)
  const d = buildDemoData(now(), lang)
  if (service === 'mail') { demo.seed({ mails: d.mails }); demo.sent.splice(0); demo.drafts.splice(0) }
  if (service === 'calendar') { demo.seed({ events: d.events }); demo.deletedEvents.splice(0) }
  if (service === 'slack') demo.seed({ slackChannels: d.slackChannels, slackMessages: d.slackMessages })
  if (service === 'discord') demo.seed({ discordChannels: d.discordChannels, discordMessages: d.discordMessages })
}

/** Loads a connected service's data into the demo store. Falls back to the mock on failure. */
export async function loadService(service: LiveService, deps: Deps = {}): Promise<boolean> {
  const r = resolve(deps)
  liveState.services[service] = 'loading'
  try {
    const input = service === 'calendar' ? calendarRange(r.now()) : {}
    const res = await callLive(service, LIVE_SNAPSHOT_OP, input, r.sessionId, r.fetchImpl)
    r.demo.setLive(service, true)
    if (res.patch) r.demo.applyLivePatch(res.patch, { viaAssistant: false })
    LIVE_SERVICES[service] = true
    liveState.services[service] = 'live'
    delete liveState.errors[service]
    return true
  } catch (e) {
    console.warn(`[connectors] live ${service} could not load, using mock data`, e)
    useMock(service, deps, e instanceof Error ? e.message : String(e))
    if (e instanceof LiveConnectorError && e.code === 'not_connected') void refreshStatus(deps)
    return false
  }
}

/** Connection status only (no data load), e.g. for a settings window. */
export async function refreshStatus(deps: Deps = {}): Promise<AuthStatus | null> {
  try {
    liveState.status = await fetchAuthStatus(deps.fetchImpl)
  } catch (e) {
    console.warn('[connectors] /api/auth/status unavailable, using mock data', e)
    liveState.status = null
  }
  liveState.checked = true
  return liveState.status
}

/** Reads the connection status and (re)loads every connected service; others use the mock. */
export async function refreshLive(deps: Deps = {}): Promise<void> {
  const status = await refreshStatus(deps)
  await Promise.all(LIVE_SERVICE_LIST.map(async (s) => {
    const p = status?.providers[PROVIDER_OF[s]]
    if (p?.connected && p.services.includes(s)) await loadService(s, deps)
    else if (LIVE_SERVICES[s] || liveState.services[s] !== 'mock') useMock(s, deps)
  }))
}

/** Handles ?connected=<p> / ?connect_error=<p>&reason=... after an OAuth redirect, then strips them. */
export function consumeAuthRedirect(loc: Location = location, hist: History = history): void {
  const url = new URL(loc.href)
  const ok = url.searchParams.get('connected')
  const bad = url.searchParams.get('connect_error')
  const p = (ok ?? bad) as LiveProvider | null
  if (!p) return
  liveState.redirect = { provider: p, ok: !!ok, ...(bad ? { reason: url.searchParams.get('reason') ?? 'error' } : {}) }
  if (ok) announce()
  for (const k of ['connected', 'connect_error', 'reason']) url.searchParams.delete(k)
  hist.replaceState(hist.state, '', `${url.pathname}${url.search}${url.hash}`)
}

// Other windows of the app (settings panel in the desktop app) tell the main window when a
// connection changed, so it reloads the live data.
const CHANNEL = 'yuiyumi-connectors'
function announce(): void {
  try { new BroadcastChannel(CHANNEL).postMessage('changed') } catch { /* unsupported */ }
}

let started = false

/** App startup: read the OAuth redirect result, then load the connected services. */
export async function startLiveConnectors(): Promise<void> {
  if (started) return
  started = true
  consumeAuthRedirect()
  try { new BroadcastChannel(CHANNEL).onmessage = () => { void refreshLive() } } catch { /* unsupported */ }
  await refreshLive()
}

export async function disconnectProvider(p: LiveProvider, deps: Deps = {}): Promise<void> {
  try {
    await logoutProvider(p, deps.fetchImpl)
  } catch (e) {
    console.warn(`[connectors] logout ${p} failed`, e)
  }
  for (const s of LIVE_SERVICE_LIST) if (PROVIDER_OF[s] === p) useMock(s, deps)
  await refreshStatus(deps)
  announce()
}

/** Opt-in: adds (or removes) the demo sample mails and events in the user's own Google account. */
export async function changeSampleData(action: 'add' | 'remove', deps: Deps = {}): Promise<void> {
  const r = resolve(deps)
  const google = liveState.status?.providers.google
  const service: LiveService | undefined = google?.services.includes('mail') ? 'mail' : google?.services.includes('calendar') ? 'calendar' : undefined
  if (!service || liveState.samples.busy) return
  liveState.samples.busy = true
  try {
    const res = await callLive(service, action === 'add' ? LIVE_SAMPLES_ADD_OP : LIVE_SAMPLES_REMOVE_OP, action === 'add' ? { lang: r.lang } : {}, r.sessionId, r.fetchImpl)
    const n = res.result as { mailsAdded?: number, eventsAdded?: number, mailsRemoved?: number, eventsRemoved?: number }
    liveState.samples.last = action === 'add'
      ? { ok: true, added: (n.mailsAdded ?? 0) + (n.eventsAdded ?? 0) }
      : { ok: true, removed: (n.mailsRemoved ?? 0) + (n.eventsRemoved ?? 0) }
    await Promise.all((google?.services ?? []).map(s => loadService(s, deps)))
  } catch (e) {
    liveState.samples.last = { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    liveState.samples.busy = false
  }
}
