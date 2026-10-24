// Desktop choreography of the studio: bring the Code and Browser windows forward and move
// the avatar beside them. Imports only `stage` from the actuator (the desktop build swaps the
// actuator for a stand-in that has nothing else).

import { bus } from '@/core/bus'
import { stage } from '@/desktop/actuator'
import { assistantWindow, CHARACTER_H, CHARACTER_W, desktop, DESKTOP_H, DESKTOP_W, DOCK_H, focusWindow, moveAssistantWindow } from '@/desktop/windows'

type StudioWindow = 'code' | 'browser'

const SIDE_Y = DESKTOP_H - DOCK_H - CHARACTER_H - 8

/** Avatar x beside the union of the open studio windows (side with more room), or null. */
export function studioAsideX(rects: { x: number, w: number }[]): number | null {
  if (!rects.length) return null
  const left = Math.min(...rects.map(r => r.x))
  const right = Math.max(...rects.map(r => r.x + r.w))
  return DESKTOP_W - right >= left
    ? Math.min(right + 12, DESKTOP_W - CHARACTER_W - 8)
    : Math.max(left - CHARACTER_W - 12, 8)
}

function slideAside(): void {
  const rects = (['code', 'browser'] as const).map(id => desktop.windows[id]).filter(w => w?.open)
  const x = studioAsideX(rects)
  if (x === null) return
  const left = Math.min(...rects.map(r => r.x))
  const right = Math.max(...rects.map(r => r.x + r.w))
  const overlaps = assistantWindow.x < right && assistantWindow.x + CHARACTER_W > left
  if (!overlaps && Math.abs(assistantWindow.y - SIDE_Y) < 200) return
  moveAssistantWindow(x, SIDE_Y)
}

function glanceAt(id: StudioWindow): void {
  const w = desktop.windows[id]
  if (w) bus.emit('character:look', { x: w.x + w.w / 2, y: w.y + w.h / 3, holdMs: 3000 })
}

export function showStudioWindow(id: StudioWindow): void {
  if (!desktop.windows[id]) return
  focusWindow(id)
  stage.target = id
  slideAside()
  glanceAt(id)
}

export function clearStudioStage(): void {
  if (stage.target === 'code' || stage.target === 'browser') stage.target = null
}
