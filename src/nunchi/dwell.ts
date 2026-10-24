// Dwell time: how long the screen has stayed visually the same (frame hash within a small
// Hamming distance of the frame that started the current dwell).

import { hammingHex } from '@/host/ahash'

/** 144-bit hash; small UI changes (clock, caret, hover) stay under this. */
export const DWELL_MAX_DISTANCE = 12

export class DwellTracker {
  private anchor: string | null = null
  private since = 0

  constructor(private readonly maxDistance = DWELL_MAX_DISTANCE) {}

  /** Feed the latest frame hash; returns dwell seconds. */
  update(hash: string, now: number): number {
    if (this.anchor === null || !hash || hammingHex(hash, this.anchor) > this.maxDistance) {
      this.anchor = hash
      this.since = now
    }
    return this.seconds(now)
  }

  seconds(now: number): number {
    return this.anchor === null ? 0 : Math.max(0, Math.floor((now - this.since) / 1000))
  }

  reset(): void {
    this.anchor = null
  }
}
