import { describe, expect, it } from 'vitest'
import {
  createProject, deleteFile, getProject, listFiles, loadState, MAX_PROJECTS, readFile, saveState, slugify, sortedPaths,
  STORAGE_KEY, writeFile, type VfsState,
} from './vfs'

const fresh = (): VfsState => ({ projects: [] })

describe('studio vfs', () => {
  it('slugifies names in any script and keeps slugs unique', () => {
    expect(slugify('Todo App')).toBe('todo-app')
    expect(slugify('할 일 앱')).toBe('할-일-앱')
    expect(slugify('ポモドーロ・タイマー!')).toBe('ポモドーロタイマー')
    expect(slugify('  ***  ')).toBe('app')
    const s = fresh()
    expect(createProject(s, 'Todo').slug).toBe('todo')
    expect(createProject(s, 'Todo').slug).toBe('todo-2')
    expect(createProject(s, 'Todo').slug).toBe('todo-3')
  })

  it('writes, reads, lists in editor order and deletes files', () => {
    const s = fresh()
    const p = createProject(s, 'Timer', 1000)
    expect(writeFile(p, 'app.js', 'let a = 1', undefined, 2000)).toEqual({ ok: true, value: { bytes: 9, created: true } })
    writeFile(p, 'style.css', 'body{}')
    writeFile(p, 'index.html', '<p>한</p>')
    expect(writeFile(p, 'app.js', 'let a = 2')).toMatchObject({ ok: true, value: { created: false } })
    expect(sortedPaths(p)).toEqual(['index.html', 'style.css', 'app.js'])
    expect(listFiles(p)).toEqual([
      { path: 'index.html', bytes: 10 }, // UTF-8: 한 is 3 bytes
      { path: 'style.css', bytes: 6 },
      { path: 'app.js', bytes: 9 },
    ])
    expect(readFile(p, 'app.js')).toEqual({ ok: true, value: 'let a = 2' })
    expect(readFile(p, 'nope.js')).toEqual({ ok: false, error: 'No such file: nope.js' })
    expect(deleteFile(p, 'style.css').ok).toBe(true)
    expect(deleteFile(p, 'style.css').ok).toBe(false)
    expect(getProject(s, p.id)?.files).toEqual({ 'index.html': '<p>한</p>', 'app.js': 'let a = 2' })
  })

  it('rejects unsafe paths and unknown file types', () => {
    const p = createProject(fresh(), 'X')
    for (const bad of ['../x.js', '/etc/passwd.txt', 'a/../b.js', 'a//b.js', 'run.sh', 'index.php', '', 'a\\b.js', './a.js']) {
      const r = writeFile(p, bad, 'x')
      expect(r.ok, bad).toBe(false)
    }
    expect(writeFile(p, 'js/app.js', 'x').ok).toBe(true)
    expect(writeFile(p, 'img/logo.svg', '<svg/>').ok).toBe(true)
  })

  it('caps file count, file size and project size', () => {
    const limits = { maxFiles: 3, maxTotalBytes: 100, maxFileBytes: 60 }
    const p = createProject(fresh(), 'X')
    expect(writeFile(p, 'a.js', 'x'.repeat(61), limits)).toMatchObject({ ok: false, error: expect.stringContaining('File too large') })
    expect(writeFile(p, 'a.js', 'x'.repeat(60), limits).ok).toBe(true)
    expect(writeFile(p, 'b.js', 'x'.repeat(41), limits)).toMatchObject({ ok: false, error: expect.stringContaining('Project too large') })
    expect(writeFile(p, 'b.js', 'x'.repeat(40), limits).ok).toBe(true)
    // Replacing a file counts its new size only.
    expect(writeFile(p, 'a.js', 'y'.repeat(60), limits).ok).toBe(true)
    expect(writeFile(p, 'c.js', '', limits).ok).toBe(true)
    expect(writeFile(p, 'd.js', '', limits)).toMatchObject({ ok: false, error: expect.stringContaining('Too many files') })
  })

  it('keeps the newest projects only', () => {
    const s = fresh()
    for (let i = 0; i < MAX_PROJECTS + 3; i++) createProject(s, `P${i}`)
    expect(s.projects).toHaveLength(MAX_PROJECTS)
    expect(s.projects[0]!.name).toBe('P3')
  })

  it('persists to storage and restores only well-formed projects', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
    const s = fresh()
    const p = createProject(s, 'Todo')
    writeFile(p, 'index.html', '<h1>hi</h1>')
    saveState(storage, s)
    expect(loadState(storage).projects).toEqual(s.projects)

    store.set(STORAGE_KEY, JSON.stringify({ projects: [{ id: 1 }, s.projects[0], { ...s.projects[0], files: { 'a.js': 3 } }] }))
    expect(loadState(storage).projects).toEqual(s.projects)
    store.set(STORAGE_KEY, '{not json')
    expect(loadState(storage)).toEqual({ projects: [] })
    expect(loadState(undefined)).toEqual({ projects: [] })
  })

  it('drops the oldest projects when the storage quota is hit', () => {
    let saved: { projects: { name: string }[] } | null = null
    const storage = {
      setItem: (_k: string, v: string) => {
        if (v.length > 500) throw new Error('QuotaExceededError')
        saved = JSON.parse(v)
      },
    }
    const s = fresh()
    for (let i = 0; i < 5; i++) writeFile(createProject(s, `P${i}`), 'index.html', 'x'.repeat(100))
    saveState(storage, s)
    expect(saved!.projects.map(p => p.name)).toEqual(['P3', 'P4'])
  })
})
