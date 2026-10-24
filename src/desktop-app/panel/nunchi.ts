// '@/nunchi' as seen by the panel windows (aliased in vite.config.ts, desktop mode). The
// engine runs in the overlay window; status is mirrored into nunchiStatus and the recent
// dialogue comes from the overlay's last broadcast.

import { mirroredDialogue } from '../sync'

export * from '../../nunchi/index'

export function recentDialogue() {
  return mirroredDialogue.value
}
