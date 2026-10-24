import { describe, expect, it, vi } from 'vitest'
import type { StudioStepRequest } from '@shared/studio'
import { createStudioExecutor, describeProject, type StudioUi } from './executor'
import { createStudioStepClient, CUT_OFF_NOTE, NOT_FINISHED_RESULT, runStudioLoop, StudioStepError, type StudioLoopDeps } from './loop'
import { createProject, writeFile, type VfsState } from './vfs'

type Reply = { status?: number, body: unknown }

/** Fake fetch that returns scripted /api/studio replies and records request bodies. */
function fakeFetch(replies: Reply[]) {
  const bodies: StudioStepRequest[] = []
  const urls: string[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    urls.push(url)
    bodies.push(JSON.parse(String(init?.body)) as StudioStepRequest)
    const r = replies.shift()
    if (!r) throw new Error('no more scripted replies')
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  })
  return { fetch: fn as unknown as typeof fetch, bodies, urls }
}

const tu = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })
const turn = (...content: unknown[]) => ({ body: { stopReason: 'tool_use', content } })

const HTML = '<!doctype html><title>Todo</title><link rel="stylesheet" href="style.css"><ul></ul><script src="app.js"></script>'

function setup(replies: Reply[], ui: Partial<StudioUi> = {}, extra: Partial<StudioLoopDeps> = {}) {
  const { fetch, bodies, urls } = fakeFetch(replies)
  const vfs: VfsState = { projects: [] }
  const ws = { vfs, currentId: null as string | null }
  const writes: string[] = []
  const openPreview = vi.fn(ui.openPreview ?? (async () => ({ errors: [] })))
  const exec = createStudioExecutor(ws, { onWrite: (_p, path) => writes.push(path), ...ui, openPreview })
  const steps: string[] = []
  const deps: StudioLoopDeps = {
    step: createStudioStepClient(fetch),
    exec,
    lang: 'ko',
    sessionId: 'sess-1',
    model: 'sonnet',
    context: () => 'No current project.',
    onStep: (n, phase) => steps.push(`${n}:${phase}`),
    ...extra,
  }
  return { deps, bodies, urls, ws, vfs, writes, openPreview, steps }
}

describe('studio step loop', () => {
  it('builds a project in one turn and ends on finish without another call', async () => {
    const { deps, bodies, urls, ws, vfs, writes, openPreview, steps } = setup([
      turn(
        { type: 'thinking', thinking: 'plan', signature: 'sig' },
        tu('t1', 'start_project', { name: '할 일' }),
        tu('t2', 'write_file', { path: 'index.html', content: HTML }),
        tu('t3', 'write_file', { path: 'style.css', content: 'body{}' }),
        tu('t4', 'write_file', { path: 'app.js', content: 'console.log(1)' }),
        tu('t5', 'open_preview', {}),
        tu('t6', 'finish', { summary: '할 일 앱을 만들었어!' }),
      ),
    ])
    const r = await runStudioLoop('간단한 할 일 앱 만들어줘', deps)

    expect(r).toEqual({ ok: true, summary: '할 일 앱을 만들었어!', steps: 1, finished: true })
    expect(urls).toEqual(['/api/studio'])
    expect(bodies[0]).toMatchObject({ lang: 'ko', sessionId: 'sess-1', model: 'sonnet' })
    expect(bodies[0]!.messages).toEqual([{ role: 'user', content: '간단한 할 일 앱 만들어줘\n\n<context>\nUser language: ko\nNo current project.\n</context>' }])
    expect(writes).toEqual(['index.html', 'style.css', 'app.js'])
    const p = vfs.projects[0]!
    expect(ws.currentId).toBe(p.id)
    expect(p).toMatchObject({ name: '할 일', slug: '할-일' })
    expect(Object.keys(p.files)).toEqual(['index.html', 'style.css', 'app.js'])
    // open_preview defaults its entry.
    expect(openPreview).toHaveBeenCalledWith(p, 'index.html')
    expect(steps).toEqual(['1:start', '1:end'])
  })

  it('returns validation errors to the model and lets it fix them', async () => {
    const { deps, bodies, vfs } = setup([
      turn(
        tu('a', 'write_file', { path: '../escape.js', content: 'x' }),
        tu('b', 'write_file', { path: 'index.html' }),
        tu('c', 'rm_rf', {}),
        tu('d', 'open_preview', { entry: 'app.js' }),
      ),
      turn(tu('e', 'write_file', { path: 'index.html', content: HTML }), tu('f', 'open_preview', { entry: 'index.html' })),
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: '다 됐어.' }] } },
    ])
    const r = await runStudioLoop('make an app', deps)
    expect(r).toEqual({ ok: true, summary: '다 됐어.', steps: 3, finished: false })

    const results = (bodies[1]!.messages[2] as { content: { tool_use_id: string, content: string, is_error?: boolean }[] }).content
    expect(results.map(x => [x.tool_use_id, x.is_error])).toEqual([['a', true], ['b', true], ['c', true], ['d', true]])
    expect(results[0]!.content).toMatch(/Invalid input for write_file: path:/)
    expect(results[1]!.content).toMatch(/content/)
    expect(results[2]!.content).toBe('Unknown tool "rm_rf".')
    expect(results[3]!.content).toMatch(/entry must be an \.html file/)
    // Written without start_project: an auto-created project.
    expect(vfs.projects).toHaveLength(1)
    expect(vfs.projects[0]!.name).toBe('App')
  })

  it('does not finish in a turn where a tool failed (e.g. runtime errors in the preview)', async () => {
    let calls = 0
    const { deps, bodies } = setup([
      turn(tu('w', 'write_file', { path: 'index.html', content: HTML }), tu('p', 'open_preview', {}), tu('f', 'finish', { summary: 'done' })),
      turn(tu('w2', 'write_file', { path: 'index.html', content: HTML }), tu('p2', 'open_preview', {}), tu('f2', 'finish', { summary: 'fixed and done' })),
    ], { openPreview: async () => ({ errors: calls++ === 0 ? ['ReferenceError: x is not defined (line 3)'] : [] }) })
    const r = await runStudioLoop('app', deps)
    expect(r).toMatchObject({ ok: true, summary: 'fixed and done', steps: 2, finished: true })
    const results = (bodies[1]!.messages[2] as { content: { tool_use_id: string, content: string, is_error?: boolean }[] }).content
    expect(results.find(x => x.tool_use_id === 'p')).toMatchObject({ is_error: true, content: expect.stringContaining('ReferenceError: x is not defined') })
    expect(results.find(x => x.tool_use_id === 'f')).toEqual({ type: 'tool_result', tool_use_id: 'f', content: NOT_FINISHED_RESULT, is_error: true })
  })

  it('notes a cut-off turn', async () => {
    const { deps, bodies } = setup([
      { body: { stopReason: 'max_tokens', content: [tu('w', 'write_file', { path: 'index.html' })] } },
      { body: { stopReason: 'end_turn', content: [{ type: 'text', text: 'ok' }] } },
    ])
    await runStudioLoop('app', deps)
    const content = (bodies[1]!.messages[2] as { content: { type: string, text?: string }[] }).content
    expect(content.at(-1)).toEqual({ type: 'text', text: CUT_OFF_NOTE })
  })

  it('stops at the step limit', async () => {
    const replies = Array.from({ length: 3 }, (_, i) => turn(tu(`l${i}`, 'list_files', {})))
    const { deps } = setup(replies, {}, { maxSteps: 3 })
    expect(await runStudioLoop('app', deps)).toEqual({ ok: false, cause: 'max_steps', steps: 3 })
  })

  it('maps server errors (budget) and aborts', async () => {
    const { deps } = setup([{ status: 429, body: { error: 'budget reached', code: 'budget' } }])
    const r = await runStudioLoop('app', deps)
    expect(r).toMatchObject({ ok: false, cause: 'error', steps: 1 })
    const e = (r as { error: unknown }).error
    expect(e).toBeInstanceOf(StudioStepError)
    expect(e).toMatchObject({ status: 429, code: 'budget' })

    const ctl = new AbortController()
    ctl.abort()
    const { deps: d2, bodies } = setup([], {}, { signal: ctl.signal })
    expect(await runStudioLoop('app', d2)).toEqual({ ok: false, cause: 'aborted', steps: 0 })
    expect(bodies).toHaveLength(0)
  })

  it('rejects a malformed response', async () => {
    const { deps } = setup([{ body: { nope: true } }])
    const r = await runStudioLoop('app', deps)
    expect((r as { error: StudioStepError }).error.message).toBe('malformed studio response')
  })
})

describe('studio executor', () => {
  it('reads, lists and deletes in the current project, and describes it for the model', async () => {
    const vfs: VfsState = { projects: [] }
    const p = createProject(vfs, 'Todo')
    writeFile(p, 'index.html', '<h1>x</h1>')
    writeFile(p, 'app.js', 'let a')
    const ws = { vfs, currentId: p.id }
    const exec = createStudioExecutor(ws, { openPreview: async () => ({ errors: [] }) })

    expect(describeProject(p)).toBe('Current project: "Todo" at yuiyumi.local/todo. Files: index.html (10 B), app.js (5 B).')
    expect(describeProject(undefined)).toBe('No current project.')
    expect(await exec('read_file', { path: 'app.js' })).toEqual({ ok: true, data: { path: 'app.js', content: 'let a' } })
    expect(await exec('list_files', {})).toEqual({ ok: true, data: { project: 'Todo', files: [{ path: 'index.html', bytes: 10 }, { path: 'app.js', bytes: 5 }] } })
    expect(await exec('delete_file', { path: 'app.js' })).toEqual({ ok: true, data: { deleted: 'app.js' } })
    expect(await exec('open_preview', { entry: 'other.html' })).toMatchObject({ ok: false, error: 'No such file: other.html. Write it first.' })
    expect(await exec('open_preview', { entry: 'index.html' })).toEqual({ ok: true, data: { opened: 'yuiyumi.local/todo', runtimeErrors: 0 } })

    // start_project switches to a fresh project.
    expect(await exec('start_project', { name: 'Timer' })).toEqual({ ok: true, data: { project: 'Timer', address: 'yuiyumi.local/timer' } })
    expect(await exec('list_files', {})).toEqual({ ok: true, data: { project: 'Timer', files: [] } })
    expect(await exec('read_file', { path: 'app.js' })).toMatchObject({ ok: false })
  })
})
