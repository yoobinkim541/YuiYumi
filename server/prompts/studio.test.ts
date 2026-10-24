import { describe, expect, it } from 'vitest'
import { getStudioTool, STUDIO_LIMITS, STUDIO_TOOL_NAMES, StudioStepRequestSchema } from '../../shared/studio.js'
import { buildStudioRequest, sanitizeStudioMessages, STUDIO_MAX_MESSAGES, studioSystemPrompt, studioTools } from './studio.js'

describe('studio tools', () => {
  it('exposes the six file tools plus start_project with JSON schemas', () => {
    const tools = studioTools()
    expect(tools.map(t => t.name)).toEqual(['start_project', 'write_file', 'read_file', 'list_files', 'delete_file', 'open_preview', 'finish'])
    expect(STUDIO_TOOL_NAMES).toEqual(tools.map(t => t.name))
    const write = tools.find(t => t.name === 'write_file')!
    expect(write.input_schema).toMatchObject({ type: 'object', required: ['path', 'content'] })
    // open_preview's entry has a default, so it is optional for the model.
    const preview = tools.find(t => t.name === 'open_preview')!
    expect((preview.input_schema as { required?: string[] }).required ?? []).not.toContain('entry')
    expect(JSON.stringify(tools)).not.toContain('$schema')
  })

  it('validates tool input', () => {
    const write = getStudioTool('write_file')!.input
    expect(write.safeParse({ path: 'index.html', content: '' }).success).toBe(true)
    expect(write.safeParse({ path: 'js/app.js', content: 'x' }).success).toBe(true)
    for (const path of ['../a.js', '/a.js', 'a/./b.js', 'a.exe', 'a b.js', 'x'.repeat(STUDIO_LIMITS.maxPathLength) + '.js']) {
      expect(write.safeParse({ path, content: '' }).success, path).toBe(false)
    }
    expect(write.safeParse({ path: 'a.js', content: 'x'.repeat(STUDIO_LIMITS.maxFileBytes + 1) }).success).toBe(false)

    const preview = getStudioTool('open_preview')!.input
    expect(preview.parse({})).toEqual({ entry: 'index.html' })
    expect(preview.safeParse({ entry: 'app.js' }).success).toBe(false)

    const finish = getStudioTool('finish')!.input
    expect(finish.safeParse({ summary: '  ' }).success).toBe(false)
    expect(finish.safeParse({ summary: 'x'.repeat(STUDIO_LIMITS.maxSummaryLength + 1) }).success).toBe(false)
    expect(getStudioTool('start_project')!.input.safeParse({ name: '' }).success).toBe(false)
    expect(getStudioTool('nope')).toBeUndefined()
  })

  it('validates the step request', () => {
    const ok = { lang: 'ko', sessionId: 's', messages: [{ role: 'user', content: 'x' }] }
    expect(StudioStepRequestSchema.safeParse(ok).success).toBe(true)
    expect(StudioStepRequestSchema.safeParse({ ...ok, model: 'opus' }).success).toBe(true)
    expect(StudioStepRequestSchema.safeParse({ ...ok, model: 'haiku' }).success).toBe(false)
    expect(StudioStepRequestSchema.safeParse({ ...ok, lang: 'fr' }).success).toBe(false)
    expect(StudioStepRequestSchema.safeParse({ ...ok, messages: [] }).success).toBe(false)
  })
})

describe('studio request builder', () => {
  it('localizes the UI language and keeps the sandbox rules in the prompt', () => {
    const p = studioSystemPrompt('ja')
    expect(p).toContain('日本語 (ja)')
    expect(p).toMatch(/no external fonts, images, CDNs or network requests/)
    expect(p).toMatch(/localStorage may be missing/)
  })

  it('builds one auto-tool-choice call with the studio tools', () => {
    const req = buildStudioRequest({ model: 'claude-sonnet-5-5', lang: 'ko', messages: [{ role: 'user', content: 'todo app' }] })
    expect(req).toMatchObject({ model: 'claude-sonnet-5-5', tool_choice: { type: 'auto' }, output_config: { effort: 'low' } })
    expect(req.tools).toHaveLength(7)
    expect(req.system).toContain('한국어 (ko)')
  })

  it('sanitizes messages', () => {
    expect(sanitizeStudioMessages([{ role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }])
    expect(sanitizeStudioMessages([])).toBeNull()
    expect(sanitizeStudioMessages([{ role: 'assistant', content: 'x' }])).toBeNull()
    expect(sanitizeStudioMessages([{ role: 'system', content: 'x' }])).toBeNull()
    expect(sanitizeStudioMessages([{ role: 'user', content: [{ text: 'no type' }] }])).toBeNull()
    expect(sanitizeStudioMessages(Array.from({ length: STUDIO_MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' })))).toBeNull()
    expect(sanitizeStudioMessages([{ role: 'user', content: 'x'.repeat(1_000_000) }])).toBeNull()
  })
})
