// In-memory file system of the virtual coding studio: projects by name, each a flat map of
// relative paths to text. Pure functions over a plain state object (the store wraps it in
// reactive() and persists it), so they run unchanged under test.

import { extensionOf, STUDIO_LIMITS, StudioPathSchema, utf8Bytes } from '@shared/studio'

export interface StudioProject {
  id: string
  /** Display name chosen by the model, in the user's language. */
  name: string
  /** URL-ish name shown in the browser address bar: yuiyumi.local/<slug>. */
  slug: string
  files: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface VfsState {
  projects: StudioProject[]
}

export type VfsResult<T = undefined> = { ok: true, value: T } | { ok: false, error: string }

export interface VfsLimits {
  maxFiles: number
  maxTotalBytes: number
  maxFileBytes: number
}

export const DEFAULT_LIMITS: VfsLimits = {
  maxFiles: STUDIO_LIMITS.maxFiles,
  maxTotalBytes: STUDIO_LIMITS.maxTotalBytes,
  maxFileBytes: STUDIO_LIMITS.maxFileBytes,
}

/** Most projects kept (oldest dropped first). */
export const MAX_PROJECTS = 12

const ok = <T>(value: T): VfsResult<T> => ({ ok: true, value })
const err = (error: string): VfsResult<never> => ({ ok: false, error })

/** Lowercase, spaces to dashes, letters (any script) and digits kept. "할 일 앱" -> "할-일-앱". */
export function slugify(name: string): string {
  const s = name.normalize('NFKC').toLowerCase().trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return s.slice(0, 40) || 'app'
}

function uniqueSlug(state: VfsState, base: string): string {
  const taken = new Set(state.projects.map(p => p.slug))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

let idSeq = 0
function newId(now: number): string {
  return `p${now.toString(36)}${(idSeq++).toString(36)}`
}

export function createProject(state: VfsState, name: string, now: number = Date.now()): StudioProject {
  const clean = name.trim().slice(0, STUDIO_LIMITS.maxNameLength) || 'App'
  const project: StudioProject = { id: newId(now), name: clean, slug: uniqueSlug(state, slugify(clean)), files: {}, createdAt: now, updatedAt: now }
  state.projects.push(project)
  while (state.projects.length > MAX_PROJECTS) state.projects.shift()
  return state.projects[state.projects.length - 1]!
}

export function getProject(state: VfsState, id: string | null | undefined): StudioProject | undefined {
  return id ? state.projects.find(p => p.id === id) : undefined
}

export function projectBytes(p: StudioProject): number {
  return Object.values(p.files).reduce((n, c) => n + utf8Bytes(c), 0)
}

function checkPath(path: string): string | null {
  const r = StudioPathSchema.safeParse(path)
  return r.success ? null : `Invalid path "${path}": ${r.error.issues[0]?.message ?? 'invalid'}`
}

export function writeFile(p: StudioProject, path: string, content: string, limits: VfsLimits = DEFAULT_LIMITS, now: number = Date.now()): VfsResult<{ bytes: number, created: boolean }> {
  const bad = checkPath(path)
  if (bad) return err(bad)
  const bytes = utf8Bytes(content)
  if (bytes > limits.maxFileBytes) return err(`File too large (${bytes} bytes, max ${limits.maxFileBytes}). Split it or make it shorter.`)
  const created = !(path in p.files)
  if (created && Object.keys(p.files).length >= limits.maxFiles) return err(`Too many files (max ${limits.maxFiles}).`)
  const total = projectBytes(p) - (created ? 0 : utf8Bytes(p.files[path]!)) + bytes
  if (total > limits.maxTotalBytes) return err(`Project too large (${total} bytes, max ${limits.maxTotalBytes}). Keep the files shorter.`)
  p.files[path] = content
  p.updatedAt = now
  return ok({ bytes, created })
}

export function readFile(p: StudioProject, path: string): VfsResult<string> {
  const bad = checkPath(path)
  if (bad) return err(bad)
  return path in p.files ? ok(p.files[path]!) : err(`No such file: ${path}`)
}

export function deleteFile(p: StudioProject, path: string, now: number = Date.now()): VfsResult {
  const bad = checkPath(path)
  if (bad) return err(bad)
  if (!(path in p.files)) return err(`No such file: ${path}`)
  delete p.files[path]
  p.updatedAt = now
  return ok(undefined)
}

const ORDER = ['html', 'css', 'js', 'json', 'svg', 'md', 'txt']

/** Paths in editor order: index.html first, then by type (html, css, js, ...), then by name. */
export function sortedPaths(p: StudioProject): string[] {
  const rank = (path: string) => (path === 'index.html' ? -1 : ORDER.indexOf(extensionOf(path)))
  return Object.keys(p.files).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export function listFiles(p: StudioProject): { path: string, bytes: number }[] {
  return sortedPaths(p).map(path => ({ path, bytes: utf8Bytes(p.files[path]!) }))
}

// ---------------------------------------------------------------------------
// Persistence (localStorage): best effort, never throws.

export const STORAGE_KEY = 'yuiyumi.studio.v1'

function isProject(v: unknown): v is StudioProject {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Partial<StudioProject>
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.slug === 'string'
    && typeof p.files === 'object' && p.files !== null && Object.values(p.files).every(c => typeof c === 'string')
    && typeof p.createdAt === 'number' && typeof p.updatedAt === 'number'
}

export function loadState(storage: Pick<Storage, 'getItem'> | undefined): VfsState {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    const v = raw ? JSON.parse(raw) as { projects?: unknown } : null
    const projects = Array.isArray(v?.projects) ? v.projects.filter(isProject).slice(-MAX_PROJECTS) : []
    return { projects }
  } catch {
    return { projects: [] }
  }
}

/** Saves the projects; on quota errors drops the oldest until it fits. */
export function saveState(storage: Pick<Storage, 'setItem'> | undefined, state: VfsState): void {
  if (!storage) return
  let projects = state.projects.slice(-MAX_PROJECTS)
  while (true) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ projects }))
      return
    } catch {
      if (projects.length <= 1) return
      projects = projects.slice(1)
    }
  }
}
