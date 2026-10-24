import { describe, expect, it } from 'vitest'
import { decidePermission, gradeTool, summarizeResult, summarizeTool } from '../src/tools.ts'

const cwd = '/work/project'
const decide = (level: 'manual' | 'auto' | 'bypass', tool: string, input: Record<string, unknown> = {}, blockedPath?: string) =>
  decidePermission({ level, tool, input, cwd, blockedPath })

describe('gradeTool', () => {
  it('grades built-in tools and treats unknown or MCP tools as outbound', () => {
    expect(gradeTool('Read')).toBe('read')
    expect(gradeTool('Grep')).toBe('read')
    expect(gradeTool('WebSearch')).toBe('read')
    expect(gradeTool('Edit')).toBe('write')
    expect(gradeTool('Bash')).toBe('shell')
    expect(gradeTool('WebFetch')).toBe('network')
    expect(gradeTool('mcp__slack__post_message')).toBe('outbound')
    expect(gradeTool('SomethingNew')).toBe('outbound')
  })
})

describe('decidePermission', () => {
  it('never asks for read-only tools inside the project', () => {
    for (const level of ['manual', 'auto', 'bypass'] as const) {
      expect(decide(level, 'Read', { file_path: '/work/project/src/a.ts' })).toBe('allow')
      expect(decide(level, 'Glob', { pattern: '**/*.ts' })).toBe('allow')
      expect(decide(level, 'WebSearch', { query: 'vue 3 teleport' })).toBe('allow')
      expect(decide(level, 'TodoWrite', { todos: [] })).toBe('allow')
    }
  })

  it('asks before reading outside the project unless bypass', () => {
    expect(decide('manual', 'Read', { file_path: '/Users/me/.ssh/id_ed25519' })).toBe('ask')
    expect(decide('auto', 'Read', { file_path: '../other/secret.txt' })).toBe('ask')
    expect(decide('auto', 'Grep', { pattern: 'x' }, '/etc')).toBe('ask')
    expect(decide('bypass', 'Read', { file_path: '/etc/hosts' })).toBe('allow')
  })

  it('manual asks before writes, shell, network and outbound tools', () => {
    expect(decide('manual', 'Write', { file_path: 'hello.txt' })).toBe('ask')
    expect(decide('manual', 'Edit', { file_path: '/work/project/a.ts' })).toBe('ask')
    expect(decide('manual', 'Bash', { command: 'ls' })).toBe('ask')
    expect(decide('manual', 'WebFetch', { url: 'https://example.com' })).toBe('ask')
    expect(decide('manual', 'mcp__mail__send', {})).toBe('ask')
  })

  it('auto asks only for shell, outbound and writes outside the project', () => {
    expect(decide('auto', 'Write', { file_path: 'hello.txt' })).toBe('allow')
    expect(decide('auto', 'NotebookEdit', { notebook_path: 'n.ipynb' })).toBe('allow')
    expect(decide('auto', 'WebFetch', { url: 'https://example.com' })).toBe('allow')
    expect(decide('auto', 'Write', { file_path: '/tmp/elsewhere.txt' })).toBe('ask')
    expect(decide('auto', 'Edit', { file_path: '/work/project-other/a.ts' })).toBe('ask')
    expect(decide('auto', 'Bash', { command: 'npm test' })).toBe('ask')
    expect(decide('auto', 'mcp__slack__post_message', {})).toBe('ask')
  })

  it('bypass never asks', () => {
    expect(decide('bypass', 'Bash', { command: 'rm -rf build' })).toBe('allow')
    expect(decide('bypass', 'Write', { file_path: '/tmp/x' })).toBe('allow')
    expect(decide('bypass', 'mcp__x__y', {})).toBe('allow')
  })
})

describe('summaries', () => {
  it('describes calls in one line, paths relative to the project', () => {
    expect(summarizeTool('Write', { file_path: '/work/project/src/hello.txt', content: 'hi' }, cwd)).toBe('src/hello.txt')
    expect(summarizeTool('Bash', { command: 'pnpm test\n--run', description: 'Run tests' }, cwd)).toBe('Run tests: pnpm test --run')
    expect(summarizeTool('Grep', { pattern: 'TODO', path: '/work/project/src' }, cwd)).toBe('"TODO" in src')
    expect(summarizeTool('Read', { file_path: '/etc/hosts' }, cwd)).toBe('/etc/hosts')
    expect(summarizeTool('Bash', { command: 'x'.repeat(400) }, cwd).length).toBe(160)
  })

  it('excerpts tool results from strings and text blocks', () => {
    expect(summarizeResult('  done \n')).toBe('done')
    expect(summarizeResult([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n\nb')
    expect(summarizeResult('y'.repeat(1000)).length).toBe(600)
  })
})
