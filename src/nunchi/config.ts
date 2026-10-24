// Runtime-tunable limits for proactive interjections. The settings window edits this
// object; gate.ts reads it on every check. Defaults: 3 a day, 10 min apart, 20 s dwell.

import { reactive, watch } from 'vue'

export interface NunchiConfig {
  maxPerDay: number
  cooldownMs: number
  minDwellSec: number
}

export const NUNCHI_DEFAULTS: Readonly<NunchiConfig> = Object.freeze({
  maxPerDay: 3,
  cooldownMs: 10 * 60_000,
  minDwellSec: 20,
})

const KEY = 'yuiyumi.nunchi.config'

function load(): NunchiConfig {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<NunchiConfig>) : {}
    const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : d)
    return {
      maxPerDay: num(v.maxPerDay, NUNCHI_DEFAULTS.maxPerDay),
      cooldownMs: num(v.cooldownMs, NUNCHI_DEFAULTS.cooldownMs),
      minDwellSec: num(v.minDwellSec, NUNCHI_DEFAULTS.minDwellSec),
    }
  } catch {
    return { ...NUNCHI_DEFAULTS }
  }
}

export const nunchiConfig = reactive<NunchiConfig>(load())

export function resetNunchiConfig(): void {
  Object.assign(nunchiConfig, NUNCHI_DEFAULTS)
}

watch(nunchiConfig, (v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ }
}, { deep: true })
