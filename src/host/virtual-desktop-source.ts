// ScreenSource backed by the in-page virtual desktop ([data-capture-root]).
// Only that element is rendered; character and overlay layers are siblings outside it.

import { domToCanvas } from 'modern-screenshot'
import type { ActivitySnapshot, Frame, ScreenSource } from '@/core/types'
import { getActivity } from '@/desktop/activity'
import { averageHash, HASH_H, HASH_W } from './ahash'

export const CAPTURE_W = 1920
export const CAPTURE_H = 1080
const JPEG_QUALITY = 0.7

export class VirtualDesktopSource implements ScreenSource {
  private hashCanvas: HTMLCanvasElement | null = null

  async capture(): Promise<Frame> {
    const root = document.querySelector<HTMLElement>('[data-capture-root]')
    if (!root) throw new Error('virtual desktop not mounted')
    const canvas = await domToCanvas(root, {
      width: CAPTURE_W,
      height: CAPTURE_H,
      scale: 1,
      backgroundColor: '#ffffff',
      // System fonts only; skip web font embedding for speed.
      font: false,
    })
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const jpegBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    return { jpegBase64, width: canvas.width, height: canvas.height, hash: this.hash(canvas) }
  }

  activity(): ActivitySnapshot {
    return getActivity()
  }

  private hash(src: HTMLCanvasElement): string {
    const c = (this.hashCanvas ??= Object.assign(document.createElement('canvas'), { width: HASH_W, height: HASH_H }))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''
    ctx.drawImage(src, 0, 0, HASH_W, HASH_H)
    return averageHash(ctx.getImageData(0, 0, HASH_W, HASH_H).data)
  }
}
