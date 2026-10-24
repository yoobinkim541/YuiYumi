// Screen source registry. The web build uses the virtual desktop; a Tauri host can
// register a native source later through setScreenSource().

import type { ScreenSource } from '@/core/types'
import { VirtualDesktopSource } from './virtual-desktop-source'

let source: ScreenSource | null = null

export function getScreenSource(): ScreenSource {
  source ??= new VirtualDesktopSource()
  return source
}

export function setScreenSource(next: ScreenSource): void {
  source = next
}
