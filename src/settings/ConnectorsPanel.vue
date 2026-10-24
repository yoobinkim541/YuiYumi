<script setup lang="ts">
// Settings > Connectors: connect / disconnect the user's own Google, Slack and Discord
// accounts (OAuth redirects), live/sample state per service, and the opt-in sample data.
// Self-contained; mounted by SettingsApp inside its themed (.yy-airi) page.

import { computed, onMounted } from 'vue'
import { LIVE_PROVIDERS, LIVE_SERVICE_LIST, PROVIDER_OF, type LiveProvider, type LiveService } from '@shared/contracts'
import { providerTitle, useConnectorStrings } from '@/connectors/i18n'
import { changeSampleData, consumeAuthRedirect, disconnectProvider, liveState, refreshStatus } from '@/connectors/live'
import { connectUrl } from '@/connectors/live-client'
import Icon from './Icon.vue'

const t = useConnectorStrings()

const ICON: Record<LiveProvider, string> = { google: 'mail', slack: 'slack', discord: 'discord' }
const servicesOf = (p: LiveProvider) => LIVE_SERVICE_LIST.filter(s => PROVIDER_OF[s] === p)

const rows = computed(() => LIVE_PROVIDERS.map((p) => {
  const st = liveState.status?.providers[p]
  return { p, available: !!st?.available, connected: !!st?.connected, account: st?.account ?? '' }
}))

const badge = (s: LiveService) => liveState.services[s]

/** Message after the OAuth redirect back to the app. */
const notice = computed(() => {
  const r = liveState.redirect
  if (!r) return null
  const name = providerTitle(r.provider)
  if (r.ok) return { ok: true, text: t.value.redirect.connected(name) }
  if (r.reason === 'access_denied' && r.provider === 'google') return { ok: false, text: t.value.redirect.accessDenied }
  if (r.reason === 'unavailable') return { ok: false, text: t.value.redirect.unavailable }
  return { ok: false, text: t.value.redirect.failed(name) }
})

const googleConnected = computed(() => !!liveState.status?.providers.google.connected)
const samples = computed(() => {
  const last = liveState.samples.last
  if (!last) return ''
  if (!last.ok) return t.value.samples.failed
  return last.added !== undefined ? t.value.samples.added(last.added) : t.value.samples.removed(last.removed ?? 0)
})

function connect(p: LiveProvider) {
  location.href = connectUrl(p)
}

onMounted(() => {
  // The OAuth redirect may land on the page that shows this panel.
  consumeAuthRedirect()
  if (!liveState.checked || liveState.redirect) void refreshStatus()
})
</script>

<template>
  <section class="section connectors-panel">
    <p class="hint">{{ t.intro }}</p>
    <p v-if="notice" class="notice" :class="{ ok: notice.ok }" role="status">
      {{ notice.text }}
      <button type="button" class="close" aria-label="×" @click="liveState.redirect = null">×</button>
    </p>

    <div v-for="r in rows" :key="r.p" class="row provider">
      <div class="conn">
        <span class="conn-icon"><Icon :name="ICON[r.p]" :size="20" /></span>
        <div class="txt">
          <b>{{ t.providers[r.p].title }}</b>
          <span>{{ t.providers[r.p].access }}</span>
          <span class="note">{{ t.providers[r.p].note }}</span>
          <span v-if="r.p === 'google' && r.available" class="note warn-note">{{ t.googleWarning }}</span>
          <span v-if="r.connected" class="account">{{ t.connectedAs(r.account) }}</span>
        </div>
      </div>
      <div class="conn-right">
        <div class="badges">
          <span v-for="s in servicesOf(r.p)" :key="s" class="badge" :class="badge(s) === 'live' ? 'live' : 'mock'" :title="liveState.errors[s] ?? ''">
            <span class="dot" />{{ servicesOf(r.p).length > 1 ? `${t.services[s]} · ` : '' }}{{ t.status[badge(s)] }}
          </span>
        </div>
        <button v-if="r.connected" type="button" class="btn danger" @click="disconnectProvider(r.p)">{{ t.disconnect }}</button>
        <button v-else-if="r.available" type="button" class="btn primary" @click="connect(r.p)">{{ t.connect }}</button>
        <span v-else class="unavailable">{{ t.unavailable }}</span>
      </div>
    </div>

    <div v-if="googleConnected" class="samples">
      <div class="txt">
        <b>{{ t.samples.title }}</b>
        <span>{{ t.samples.desc }}</span>
        <span v-if="samples" class="note">{{ samples }}</span>
      </div>
      <div class="sample-actions">
        <button type="button" class="btn" :disabled="liveState.samples.busy" @click="changeSampleData('add')">
          <Icon name="plus" :size="15" />{{ liveState.samples.busy ? t.samples.busy : t.samples.add }}
        </button>
        <button type="button" class="btn danger" :disabled="liveState.samples.busy" @click="changeSampleData('remove')">
          <Icon name="trash" :size="15" />{{ t.samples.remove }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.provider { align-items: flex-start; }
.conn { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.conn-icon { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; background: #fff; border: 2px solid var(--n100, #f5f5f5); color: var(--n600, #525252); }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.txt b { font-weight: 500; font-size: 14px; color: var(--n800, #262626); }
.txt span { font-size: 12.5px; color: var(--n500, #737373); line-height: 1.5; }
.txt .note { font-size: 12px; }
.txt .warn-note { color: #b45309; }
.txt .account { color: var(--p600, #1789ad); font-weight: 500; }
.conn-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
.badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.unavailable { font-size: 12px; color: var(--n400, #a3a3a3); }
.notice { position: relative; margin: 0 0 12px; padding: 8px 32px 8px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; background: #fef2f2; color: #b91c1c; }
.notice.ok { background: #f0fdf4; color: #15803d; }
.notice .close { position: absolute; top: 4px; right: 6px; border: 0; background: none; font-size: 16px; color: inherit; cursor: pointer; }
.samples { display: flex; justify-content: space-between; gap: 12px; padding-top: 12px; margin-top: 4px; border-top: 1px solid var(--n100, #f5f5f5); }
.sample-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
</style>
