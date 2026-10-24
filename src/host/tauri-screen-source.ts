// ScreenSource for the desktop app (Tauri): the real main display, captured natively
// (ScreenCaptureKit, the app's own windows left out), at most 1920x1080 JPEG. Activity comes
// from the frontmost app (name and window title) and the time since the last key press.
//
// Like the virtual desktop source it tells where the user is acting (lookTarget): the
// region that changed between the last two captures, in 1920x1080 logical coordinates.

import { invoke } from '@tauri-apps/api/core'
import type { ActivitySnapshot, Frame, ScreenSource } from '@/core/types'
import type { LookTarget } from '@/nunchi/scheduler'
import { averageHash, HASH_H, HASH_W } from './ahash'
import { changeCenter, GRID_H, GRID_W, grayGrid } from './change-region'

const LOGICAL_W = 1920
const LOGICAL_H = 1080
/** A key press this recent counts as typing (same window as the virtual desktop). */
const TYPING_SEC = 1.5
const ACTIVITY_POLL_MS = 1000
const CHANGE_FRESH_MS = 7000

interface NativeFrame { jpegBase64: string, width: number, height: number }
interface NativeActivity { activeApp: string | null, windowTitle: string | null, idleKeySec: number }

export class TauriScreenSource implements ScreenSource {
  private act: ActivitySnapshot = { activeApp: null, windowTitle: null, typing: false }
  private canvas: HTMLCanvasElement | null = null
  private prevGrid: Float32Array | null = null
  private change: { x: number, y: number, at: number } | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  /** `onPermissionMissing` runs when Screen Recording is not granted (every failed capture). */
  constructor(private onPermissionMissing: () => void = () => {}) {}

  async capture(): Promise<Frame> {
    this.pollActivity()
    let f: NativeFrame
    try {
      f = await invoke<NativeFrame>('capture_screen')
    } catch (e) {
      if (String(e) === 'permission') this.onPermissionMissing()
      throw new Error(`screen capture failed: ${String(e)}`)
    }
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${f.jpegBase64}`)).blob())
    const hash = this.analyze(bitmap)
    bitmap.close()
    return { jpegBase64: f.jpegBase64, width: f.width, height: f.height, hash }
  }

  activity(): ActivitySnapshot {
    this.pollActivity()
    return this.act
  }

  lookTarget(now: number = Date.now()): LookTarget | null {
    const c = this.change
    return c && now - c.at < CHANGE_FRESH_MS ? { x: Math.round(c.x), y: Math.round(c.y), fresh: true } : null
  }

  /** Starts the background activity poll on first use. */
  private pollActivity() {
    if (this.timer) return
    const poll = async () => {
      try {
        const a = await invoke<NativeActivity | null>('activity')
        if (a) this.act = { activeApp: a.activeApp, windowTitle: a.windowTitle, typing: a.idleKeySec < TYPING_SEC }
      } catch { /* keep the last snapshot */ }
    }
    void poll()
    this.timer = setInterval(() => void poll(), ACTIVITY_POLL_MS)
  }

  /** Perceptual hash for dwell, and the changed region for lookTarget. */
  private analyze(src: ImageBitmap): string {
    const c = (this.canvas ??= document.createElement('canvas'))
    c.width = GRID_W
    c.height = GRID_H
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''
    ctx.drawImage(src, 0, 0, GRID_W, GRID_H)
    const grid = grayGrid(ctx.getImageData(0, 0, GRID_W, GRID_H).data)
    const center = this.prevGrid ? changeCenter(this.prevGrid, grid) : null
    this.prevGrid = grid
    if (center) this.change = { x: center.x * LOGICAL_W, y: center.y * LOGICAL_H, at: Date.now() }
    c.width = HASH_W
    c.height = HASH_H
    ctx.drawImage(src, 0, 0, HASH_W, HASH_H)
    return averageHash(ctx.getImageData(0, 0, HASH_W, HASH_H).data)
  }
}
