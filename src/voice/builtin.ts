// Built-in lines at runtime: picks a variant for the active character and speech language,
// shows it (reaction or bubble) and plays its pre-generated clip. A clip is used only when
// public/voice/manifest.json lists it with the same text; otherwise spoken lines fall back
// to live TTS and pure noises are skipped.

import type { Emotion } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { bus } from '@/core/bus'
import type { CharacterId } from '@/character/models'
import { useCharacterStore } from '@/character/store'
import { useSettings } from '@/stores/settings'
import { CATEGORY_INFO, clipPath, findBuiltin, linesFor, pickVariant, stripAudioTags, type BuiltinCategory, type BuiltinLine } from './builtin-lines'
import type { PlayResult, SpeechPlayer } from './player'
import { fetchSpeech } from './tts-client'

interface Manifest { lines?: Record<string, string> }

let player: SpeechPlayer | null = null
let manifest: Record<string, string> | null = null
let manifestLoad: Promise<void> | null = null
/** Last variant per character/language/category, so a variant does not repeat. */
const lastVariant = new Map<string, number>()
/** Line being emitted by playBuiltin itself; the react handler leaves its audio to us. */
let ownLine: string | null = null

function loadManifest(): Promise<void> {
  manifestLoad ??= fetch(`${import.meta.env.BASE_URL}voice/manifest.json`)
    .then(r => (r.ok ? r.json() as Promise<Manifest> : null))
    .then((m) => { manifest = m?.lines ?? {} })
    .catch(() => { manifest = {} })
  return manifestLoad
}

export function initBuiltin(p: SpeechPlayer): void {
  player = p
  void loadManifest()
}

/** URL of the line's clip, or null when it was not generated (or is stale). */
export function clipUrl(line: BuiltinLine): string | null {
  return manifest?.[`${line.character}/${line.lang}/${line.id}`] === line.text
    ? `${import.meta.env.BASE_URL}${clipPath(line)}`
    : null
}

/** Whether the react handler should skip `text` because playBuiltin is speaking it. */
export function isOwnLine(text: string): boolean {
  return ownLine !== null && text === ownLine
}

/**
 * Plays the built-in clip for a react line that exactly matches a built-in line of the
 * active character and language. Returns false when there is none (use live TTS).
 */
export function playMatchingClip(text: string, character: CharacterId, lang: Lang): boolean {
  const line = findBuiltin(character, lang, text)
  const url = line && clipUrl(line)
  if (!line || !url || !player) return false
  void player.playClip(url, line.display, { hold: CATEGORY_INFO[line.category].hold })
  return true
}

/** A random variant (never the previous one) of a category for a character and language. */
export function pickBuiltin(category: BuiltinCategory, character: CharacterId, lang: Lang): BuiltinLine | null {
  let list = linesFor(character, lang, category)
  if (!list.length) list = linesFor(character, 'en', category)
  if (!list.length) return null
  const k = `${character}|${list[0]!.lang}|${category}`
  const i = pickVariant(list.length, lastVariant.get(k))
  lastVariant.set(k, i)
  return list[i]!
}

export interface PlayBuiltinOptions {
  /** Reaction shown with the line; defaults to the category's. null: no reaction. */
  emotion?: Emotion | null
  /** Show the line in the bubble; defaults to the category's. */
  bubble?: boolean
  /** Live text said right after the clip (e.g. a reminder title); also added to the bubble. */
  then?: string
  /** Speaker; defaults to the active character. */
  character?: CharacterId
}

/**
 * Says a random built-in line of `category` for the active character in the speech
 * language: shows it (reaction or bubble) and plays its clip. With sound off only spoken
 * lines show, in the bubble; pure noises and fillers are skipped. Returns the line, or
 * null when nothing was shown or played.
 */
export function playBuiltin(category: BuiltinCategory, opts: PlayBuiltinOptions = {}): BuiltinLine | null {
  const settings = useSettings()
  const character = opts.character ?? useCharacterStore().character
  const info = CATEGORY_INFO[category]
  const bubble = opts.bubble ?? info.bubble
  const line = pickBuiltin(category, character, settings.speechLang)
  if (!line) return null
  if (!settings.sound && (!bubble || !line.display)) return null

  const then = opts.then?.trim() ?? ''
  const shown = [line.display, then].filter(Boolean).join(' ')
  const emotion = opts.emotion === undefined ? info.emotion : opts.emotion
  if (emotion) {
    ownLine = bubble && shown ? shown : null
    try { bus.emit('character:react', { emotion, line: ownLine ?? undefined, source: 'fallback' }) }
    finally { ownLine = null }
  } else if (bubble && shown) {
    bus.emit('bubble', { text: shown, ttlMs: Math.max(3000, 1500 + shown.length * 90) })
  }
  if (settings.sound) void speak(line, then, character)
  return line
}

/** Plays the line's clip (then `then` by live TTS), or the whole line by live TTS without a clip. */
async function speak(line: BuiltinLine, then: string, character: CharacterId): Promise<void> {
  const p = player
  if (!p) return
  if (!manifest) await loadManifest()
  const settings = useSettings()
  const tts = (text: string) => ({ text, lang: line.lang, character, preset: settings.voicePreset, sessionId: settings.sessionId })
  const hold = CATEGORY_INFO[line.category].hold
  const url = clipUrl(line)

  if (!url) {
    // No clip: say spoken lines live (tags removed; not every TTS model reads them).
    const text = [line.display, then].filter(Boolean).join(' ')
    if (line.display) void p.say(tts(stripAudioTags(text)), { hold })
    return
  }
  if (!then) {
    void p.playClip(url, line.display || line.text, { hold })
    return
  }
  // Fetch the live part while the clip plays, so it follows without a gap.
  const ctl = new AbortController()
  const bytes = fetchSpeech(tts(then), ctl.signal)
  const result: PlayResult = await p.playClip(url, line.display || line.text, { hold: true })
  if (result === 'interrupted') { ctl.abort(); return }
  void p.playBytes(() => bytes, then)
}
