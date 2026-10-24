// ScreenSource backed by the in-page virtual desktop ([data-capture-root]).
// Only that element is rendered. Assistant UI inside it (character window, tray menu,
// YuiYumi settings/dashboard windows) is marked [data-no-capture] and skipped, so the
// observer never sees the assistant itself.
//
// It also tells where on the desktop the user is acting (lookTarget), so the character
// can glance there when she remarks on it: the caret or click point of the last input,
// the region that changed between the last two captures, or else the focused window.

import { domToCanvas } from 'modern-screenshot'
import type { ActivitySnapshot, Frame, ScreenSource } from '@/core/types'
import { getActivity } from '@/desktop/activity'
import { DESKTOP_H, DESKTOP_W, MENUBAR_H, topUserWindow } from '@/desktop/windows'
import type { LookTarget } from '@/nunchi/scheduler'
import { averageHash, HASH_H, HASH_W } from './ahash'
import { changeCenter, GRID_H, GRID_W, grayGrid } from './change-region'

export const CAPTURE_W = 1920
export const CAPTURE_H = 1080
const JPEG_QUALITY = 0.7
/** Input (typing, a click) this recent marks where the user is acting. */
const INPUT_FRESH_MS = 8000
/** A screen change this recent marks where the user is acting (captures are 3 s apart). */
const CHANGE_FRESH_MS = 7000

/** modern-screenshot node filter: drops [data-no-capture] subtrees. */
export function captureFilter(node: Node): boolean {
  return !(node instanceof Element && node.hasAttribute('data-no-capture'))
}

/**
 * modern-screenshot copies a text area's value into a `value` attribute, which a text
 * area does not render, so the clone would show the placeholder instead of what the user
 * is typing. Its text content is what it renders.
 */
export function showTextareaValue(cloned: Node): void {
  if (cloned.nodeType === 1 && (cloned as Element).tagName === 'TEXTAREA') {
    const el = cloned as Element
    el.textContent = el.getAttribute('value') ?? ''
  }
}

interface Spot { x: number, y: number, at: number }

const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"]'

export class VirtualDesktopSource implements ScreenSource {
  private hashCanvas: HTMLCanvasElement | null = null
  private gridCanvas: HTMLCanvasElement | null = null
  private prevGrid: Float32Array | null = null
  private change: Spot | null = null
  private click: Spot | null = null
  private typedIn: { el: HTMLElement, at: number } | null = null
  private listening = false

  async capture(): Promise<Frame> {
    const root = document.querySelector<HTMLElement>('[data-capture-root]')
    if (!root) throw new Error('virtual desktop not mounted')
    this.listen()
    const canvas = await domToCanvas(root, {
      width: CAPTURE_W,
      height: CAPTURE_H,
      scale: 1,
      backgroundColor: '#ffffff',
      // System fonts only; skip web font embedding for speed.
      font: false,
      filter: captureFilter,
      onCloneEachNode: showTextareaValue,
    })
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const jpegBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    this.trackChange(canvas)
    return { jpegBase64, width: canvas.width, height: canvas.height, hash: this.hash(canvas) }
  }

  activity(): ActivitySnapshot {
    return getActivity()
  }

  /** Where the user is acting now, in desktop coordinates; the most recent signal wins. */
  lookTarget(now: number = Date.now()): LookTarget | null {
    const spots: Spot[] = []
    const caret = this.typedIn && now - this.typedIn.at < INPUT_FRESH_MS ? this.caretSpot(this.typedIn.el, this.typedIn.at) : null
    if (caret) spots.push(caret)
    if (this.click && now - this.click.at < INPUT_FRESH_MS) spots.push(this.click)
    if (this.change && now - this.change.at < CHANGE_FRESH_MS) spots.push(this.change)
    const latest = spots.sort((a, b) => b.at - a.at)[0]
    if (latest) return { x: Math.round(latest.x), y: Math.round(latest.y), fresh: true }
    // Nothing recent: the content area of the focused window.
    const w = topUserWindow()
    return w ? { x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h * 0.4), fresh: false } : null
  }

  private listen() {
    if (this.listening) return
    this.listening = true
    const inDesktop = (t: EventTarget | null): t is HTMLElement =>
      t instanceof HTMLElement && !!t.closest('[data-capture-root]') && !t.closest('[data-no-capture]')
    document.addEventListener('keydown', (e) => {
      if (inDesktop(e.target) && e.target.matches(EDITABLE)) this.typedIn = { el: e.target, at: Date.now() }
    }, true)
    document.addEventListener('pointerdown', (e) => {
      if (!inDesktop(e.target)) return
      const p = this.toDesktop(e.clientX, e.clientY)
      if (p) this.click = { ...p, at: Date.now() }
    }, true)
  }

  /** Client point -> desktop coordinates through the scaled capture root. */
  private toDesktop(clientX: number, clientY: number): { x: number, y: number } | null {
    const r = document.querySelector<HTMLElement>('[data-capture-root]')?.getBoundingClientRect()
    if (!r || !(r.width > 0)) return null
    return { x: (clientX - r.left) * DESKTOP_W / r.width, y: (clientY - r.top) * DESKTOP_H / r.height }
  }

  /** Roughly where the caret is in an editable element (line count, not wrapping, for text areas). */
  private caretSpot(el: HTMLElement, at: number): Spot | null {
    if (!el.isConnected) return null
    const r = el.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0)) return null
    let cx = r.left + Math.min(r.width / 2, 240)
    let cy = r.top + r.height / 2
    if (el instanceof HTMLTextAreaElement) {
      const style = getComputedStyle(el)
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 18
      const lines = el.value.slice(0, el.selectionStart ?? el.value.length).split('\n').length
      cy = Math.min(r.bottom - line / 2, Math.max(r.top + line / 2, r.top + (parseFloat(style.paddingTop) || 0) + (lines - 0.5) * line - el.scrollTop))
    } else if (el.isContentEditable) {
      const sel = window.getSelection()
      const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null
      if (rect && (rect.width > 0 || rect.height > 0)) { cx = rect.left; cy = rect.top + rect.height / 2 }
    }
    const p = this.toDesktop(cx, cy)
    return p ? { ...p, at } : null
  }

  /** Compares a coarse grid of this frame with the previous one (menu bar left out). */
  private trackChange(src: HTMLCanvasElement) {
    const c = (this.gridCanvas ??= Object.assign(document.createElement('canvas'), { width: GRID_W, height: GRID_H }))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const top = Math.round(MENUBAR_H * (src.height / CAPTURE_H))
    ctx.drawImage(src, 0, top, src.width, src.height - top, 0, 0, GRID_W, GRID_H)
    const grid = grayGrid(ctx.getImageData(0, 0, GRID_W, GRID_H).data)
    const center = this.prevGrid ? changeCenter(this.prevGrid, grid) : null
    this.prevGrid = grid
    if (center) {
      this.change = { x: center.x * DESKTOP_W, y: MENUBAR_H + center.y * (DESKTOP_H - MENUBAR_H), at: Date.now() }
    }
  }

  private hash(src: HTMLCanvasElement): string {
    const c = (this.hashCanvas ??= Object.assign(document.createElement('canvas'), { width: HASH_W, height: HASH_H }))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''
    // The menu bar strip (clock, status items) is left out so ticking UI does not reset dwell.
    const top = Math.round(MENUBAR_H * (src.height / CAPTURE_H))
    ctx.drawImage(src, 0, top, src.width, src.height - top, 0, 0, HASH_W, HASH_H)
    return averageHash(ctx.getImageData(0, 0, HASH_W, HASH_H).data)
  }
}
