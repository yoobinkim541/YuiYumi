// '@/voice' as seen by the settings/dashboard panel windows (aliased in vite.config.ts,
// desktop mode). Voice runs in the overlay window; the panel shows its mirrored state and
// forwards the VAD switch there.

import { sendCommand } from '../sync'

export * from '../../voice/index'

export async function setVadEnabled(on: boolean): Promise<void> {
  await sendCommand({ vad: on })
}
