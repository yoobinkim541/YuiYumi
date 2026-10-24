// True inside the Tauri desktop app (the IPC bridge is injected into every window).
export const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
