// "Connect Gmail?" prompt the character shows when the agent works on a service that runs on
// sample data but could use the user's own account. Shown at most once per provider and
// session unless requested explicitly; ConnectPrompt.vue renders it.

import { reactive } from 'vue'
import { PROVIDER_OF, type LiveProvider, type LiveService } from '@shared/contracts'
import { liveState } from './live'

export const connectPrompt = reactive({
  provider: null as LiveProvider | null,
  service: null as LiveService | null,
  /** needed: the agent used sample data. expired: the connection stopped working. */
  reason: 'needed' as 'needed' | 'expired',
})

const offered = new Set<LiveProvider>()

/**
 * Offers to connect the provider of `service`. Does nothing when the server has no OAuth
 * client for it, it is already connected, or it was offered before (unless `force`).
 */
export function requestConnect(service: LiveService, opts: { reason?: 'needed' | 'expired', force?: boolean } = {}): boolean {
  const p = PROVIDER_OF[service]
  const st = liveState.status?.providers[p]
  const reason = opts.reason ?? 'needed'
  if (!st?.available) return false
  if (reason === 'needed' && st.connected && st.services.includes(service)) return false
  if (offered.has(p) && !opts.force) return false
  offered.add(p)
  connectPrompt.provider = p
  connectPrompt.service = service
  connectPrompt.reason = reason
  return true
}

export function dismissConnect(): void {
  connectPrompt.provider = null
  connectPrompt.service = null
}

/** Tests only. */
export function resetConnectOffers(): void {
  offered.clear()
  dismissConnect()
}
