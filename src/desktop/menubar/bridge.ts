// Shared state between the menu bar and the rest of the virtual desktop: commands that app
// windows expose to their menus, plus the system-level overlays (sleep, restart, lock) and
// dialogs opened from the system menu.

import { reactive, shallowReactive } from 'vue'

export type MailFolder = 'inbox' | 'drafts' | 'spam' | 'sent' | 'trash'

/** Commands and state an app window publishes for its menus. All members are optional. */
export interface MailCommands {
  newMessage: () => void
  showFolder: (f: MailFolder) => void
  toggleSidebar: () => void
  reply: () => void
  state: () => { folder: MailFolder, sidebar: boolean, canReply: boolean }
}

export const appCommands = shallowReactive<{ mail: Partial<MailCommands> }>({ mail: {} })

/** Called once from an app's setup to publish its menu commands. */
export function registerMailCommands(cmds: MailCommands): void {
  appCommands.mail = cmds
}

export type SystemOverlay = 'none' | 'sleep' | 'restart' | 'lock'
export type SystemDialog = 'none' | 'about' | 'settings' | 'app'

export const systemState = reactive({
  overlay: 'none' as SystemOverlay,
  dialog: 'none' as SystemDialog,
  /** App shown by the 'app' (About <App>) dialog: an AppIcon key and its display name. */
  dialogApp: { icon: 'finder', name: '' },
  /** Wi-Fi radio state, shared by the Wi-Fi panel, Control Center and System Settings. */
  wifi: true,
  bluetooth: true,
  airdrop: false,
  /** Display brightness 0..1, applied as a dim layer over the desktop. */
  brightness: 1,
  /** Fictional system volume 0..1 (the assistant's speech sound is a separate setting). */
  volume: 0.6,
})

let overlayTimer: ReturnType<typeof setTimeout> | undefined

/** Sleep and Restart fade the screen out, hold, then wake back up on their own. */
export function runPowerCycle(kind: 'sleep' | 'restart'): void {
  if (overlayTimer) clearTimeout(overlayTimer)
  systemState.overlay = kind
  overlayTimer = setTimeout(() => {
    systemState.overlay = 'none'
    overlayTimer = undefined
  }, kind === 'sleep' ? 1800 : 3200)
}

export function lockScreen(): void {
  if (overlayTimer) clearTimeout(overlayTimer)
  systemState.overlay = 'lock'
}

export function unlockScreen(): void {
  if (systemState.overlay === 'lock') systemState.overlay = 'none'
}
