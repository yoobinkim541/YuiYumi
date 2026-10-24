import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus } from '@shared/contracts'
import { buildDemoData } from '@/desktop/seed'
import { useDemo } from '@/stores/demo'
import { connectPrompt, requestConnect, resetConnectOffers } from './connect-prompt'
import { consumeAuthRedirect, LIVE_SERVICES, liveState, refreshLive, useMock } from './live'

const NOW = new Date('2026-10-24T03:00:00Z')
const deps = (fetchImpl: unknown) => ({ sessionId: 's', lang: 'ko' as const, fetchImpl: fetchImpl as typeof fetch, now: () => NOW })

function status(over: Partial<AuthStatus['providers']> = {}): AuthStatus {
  const off = { available: true, connected: false, services: [] }
  return { providers: { google: off, slack: off, discord: { ...off, available: false }, ...over }, limits: { outboundPerSession: 10, outboundPerAccountDaily: 30 } }
}

function seeded() {
  const demo = useDemo()
  demo.seed(buildDemoData(NOW, 'ko'))
  return demo
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const k of Object.keys(LIVE_SERVICES)) delete LIVE_SERVICES[k as keyof typeof LIVE_SERVICES]
  resetConnectOffers()
})

describe('live connector startup', () => {
  it('loads connected services into the store and keeps the rest on sample data', async () => {
    const demo = seeded()
    const sampleEvents = demo.events.length
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url)
      if (url === '/api/auth/status') return Response.json(status({ google: { available: true, connected: true, account: 'judge@example.com', services: ['mail'] } }))
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ op: 'snapshot', sessionId: 's' })
      return Response.json({ result: { loaded: true }, patch: { replace: ['mail'], mails: [{ id: 'g1', from: 'A <a@example.com>', to: 'judge@example.com', subject: 'Real', body: 'b', receivedAt: '2026-10-24T02:00:00.000Z', lang: 'en', read: false }], sent: [], drafts: [] } })
    })
    await refreshLive(deps(fetchImpl))
    expect(calls).toEqual(['/api/auth/status', '/api/connectors/mail'])
    expect(demo.mails.map(m => m.id)).toEqual(['g1'])
    expect(demo.live.mail).toBe(true)
    expect(LIVE_SERVICES.mail).toBe(true)
    expect(liveState.services).toMatchObject({ mail: 'live', calendar: 'mock' })
    expect(demo.events).toHaveLength(sampleEvents)

    // A language switch reseeds sample data but leaves the live mailbox alone.
    demo.seed(buildDemoData(NOW, 'ja'))
    expect(demo.mails.map(m => m.id)).toEqual(['g1'])
  })

  it('falls back to sample data when the load fails or the status endpoint is down', async () => {
    const demo = seeded()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = vi.fn(async (url: string) => (url === '/api/auth/status'
      ? Response.json(status({ slack: { available: true, connected: true, account: 'Acme', services: ['slack'] } }))
      : Response.json({ error: 'slack conversations.list: ratelimited', code: 'provider' }, { status: 502 })))
    await refreshLive(deps(failing))
    expect(liveState.services.slack).toBe('error')
    expect(LIVE_SERVICES.slack).toBe(false)
    expect(demo.slackChannels.length).toBeGreaterThan(0)

    await refreshLive(deps(vi.fn(async () => { throw new TypeError('offline') })))
    expect(liveState.status).toBeNull()
    expect(liveState.checked).toBe(true)
    warn.mockRestore()
  })

  it('restores the sample data of a service when it goes back to mock', () => {
    const demo = seeded()
    demo.setLive('calendar', true)
    demo.applyLivePatch({ replace: ['calendar'], events: [{ id: 'real', title: 'Real', start: '2026-10-24T01:00:00.000Z', end: '2026-10-24T02:00:00.000Z' }] })
    expect(demo.events.map(e => e.id)).toEqual(['real'])
    useMock('calendar', { demo, lang: 'ko', sessionId: 's', now: () => NOW })
    expect(demo.events.map(e => e.id)).toContain('ev-001')
    expect(demo.live.calendar).toBe(false)
  })

  it('applies event ranges and deletions from live patches', () => {
    const demo = seeded()
    demo.applyLivePatch({ replace: ['calendar'], events: [
      { id: 'a', title: 'A', start: '2026-10-24T01:00:00.000Z', end: '2026-10-24T02:00:00.000Z' },
      { id: 'b', title: 'B', start: '2026-10-25T01:00:00.000Z', end: '2026-10-25T02:00:00.000Z' },
    ] })
    // Listing the 24th returns only "c": "a" was deleted elsewhere, "b" is outside the range.
    demo.applyLivePatch({ events: [{ id: 'c', title: 'C', start: '2026-10-24T05:00:00.000Z', end: '2026-10-24T06:00:00.000Z' }], eventRange: { from: '2026-10-24T00:00:00.000Z', to: '2026-10-25T00:00:00.000Z' } })
    expect(demo.events.map(e => e.id).sort()).toEqual(['b', 'c'])
    demo.applyLivePatch({ removeEventIds: ['c'] })
    expect(demo.deletedEvents.map(e => e.id)).toEqual(['c'])
  })

  it('reads and strips the OAuth redirect result', () => {
    const replaced: string[] = []
    const hist = { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) } as unknown as History
    consumeAuthRedirect({ href: 'http://localhost:5180/?connect_error=google&reason=access_denied&x=1#top' } as Location, hist)
    expect(liveState.redirect).toEqual({ provider: 'google', ok: false, reason: 'access_denied' })
    expect(replaced).toEqual(['/?x=1#top'])
  })

  it('offers to connect once per provider, only when the server supports it', () => {
    liveState.status = status()
    expect(requestConnect('mail')).toBe(true)
    expect(connectPrompt).toMatchObject({ provider: 'google', service: 'mail', reason: 'needed' })
    expect(requestConnect('calendar')).toBe(false)
    expect(requestConnect('discord')).toBe(false) // not available on the server
    expect(requestConnect('mail', { reason: 'expired', force: true })).toBe(true)
  })
})
