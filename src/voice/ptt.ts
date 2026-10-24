// Push-to-talk: hold the configured shortcut (default Space) or the talk button.

import { bus } from '@/core/bus'
import { endsShortcut, hasCommandModifier, matchesShortcut, type Shortcut } from '@/settings/shortcut'
import { useSettings } from '@/stores/settings'
import { Recorder } from './recorder'
import { voiceState } from './state'
import { transcribeAndEmit, type SttContext } from './stt-client'
import { rms } from './wav'

/** Takes shorter than this, or near-silent ones, skip the STT call but still emit an empty transcript. */
const MIN_TAKE_SEC = 0.25
const SILENCE_RMS = 0.002

let recorder: Recorder | null = null
let getCtx: () => SttContext = () => { throw new Error('ptt not initialised') }
/** Bumped on every press so a release that races a slow mic open is handled. */
let pressId = 0

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target as HTMLElement
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(type)
  }
  return !!el.closest('[contenteditable=""], [contenteditable="true"]')
}

export async function pttDown(): Promise<void> {
  if (voiceState.recording) return
  const id = ++pressId
  voiceState.recording = true
  voiceState.error = null
  recorder ??= new Recorder()
  try {
    await recorder.start()
  } catch (e) {
    voiceState.recording = false
    voiceState.error = 'mic unavailable'
    console.warn('[voice] mic', e)
    return
  }
  if (id !== pressId || !voiceState.recording) { recorder.cancel(); return }
  bus.emit('voice:speech-start', { source: 'ptt' })
}

export function pttUp(): void {
  if (!voiceState.recording) return
  voiceState.recording = false
  if (!recorder?.isRecording) { pressId++; return } // released before the mic opened
  const { samples, durationSec } = recorder.stop()
  bus.emit('voice:speech-end', { source: 'ptt' })
  const usable = durationSec >= MIN_TAKE_SEC && rms(samples) >= SILENCE_RMS
  void transcribeAndEmit(usable ? samples : null, 'ptt', getCtx())
}

/**
 * Installs the shortcut key handlers. The shortcut is read on every event, so a change in
 * settings applies at once. Without Ctrl, Alt or Meta the shortcut is ignored while typing
 * in an input, textarea or contenteditable. Returns an uninstall function.
 */
export function installPtt(ctx: () => SttContext, getShortcut: () => Shortcut = () => useSettings().pttKey): () => void {
  getCtx = ctx
  /** True while a recording was started by the keyboard, so only its key release ends it. */
  let byKey = false
  const onDown = (e: KeyboardEvent) => {
    const s = getShortcut()
    if (!matchesShortcut(e, s)) return
    if (!hasCommandModifier(s) && isEditableTarget(e.target)) return
    e.preventDefault()
    if (e.repeat || voiceState.recording) return
    byKey = true
    void pttDown()
  }
  const onUp = (e: KeyboardEvent) => {
    if (!byKey || !endsShortcut(e, getShortcut())) return
    byKey = false
    e.preventDefault()
    pttUp()
  }
  const onBlur = () => {
    byKey = false
    pttUp()
  }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
  }
}
