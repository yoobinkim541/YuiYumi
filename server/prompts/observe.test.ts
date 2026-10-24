import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { describe, expect, it } from 'vitest'
import { ObserveRequestSchema, type ObserveRequest } from '../../shared/contracts'
import { buildObserveRequest, parseObserveActions } from './observe'

const req: ObserveRequest = {
  frame: { jpegBase64: 'AAAA', width: 1920, height: 1080 },
  state: {
    activeApp: 'Mail',
    windowTitle: 'Mail — 【ご相談】次回お打ち合わせの日程について',
    dwellSec: 24,
    minutesSinceLastInterjection: null,
    interjectionsToday: 0,
    typing: false,
    userSpeaking: false,
  },
  lang: 'ja',
  recent: [{ role: 'user', text: 'おはよう' }, { role: 'assistant', text: 'おはよう!' }],
  sessionId: 's1',
}

describe('buildObserveRequest', () => {
  it('builds a Haiku request with image before text, auto tool choice and low effort', () => {
    expect(ObserveRequestSchema.safeParse(req).success).toBe(true)
    const p = buildObserveRequest(req, 'claude-haiku-5-5')
    expect(p.model).toBe('claude-haiku-5-5')
    expect(p.max_tokens).toBe(1024)
    expect(p.tool_choice).toEqual({ type: 'auto' })
    expect(p.output_config).toEqual({ effort: 'low' })
    expect(p.tools?.map(t => ('name' in t ? t.name : ''))).toEqual(['react', 'delegate_task'])
    const react = p.tools![0] as { input_schema: Record<string, unknown> }
    expect(react.input_schema.type).toBe('object')
    expect(react.input_schema.$schema).toBeUndefined()
    expect(react.input_schema.required).toEqual(['emotion'])
    expect(String(p.system)).toContain('Japanese')
    const content = p.messages[0]!.content as { type: string, text?: string, source?: { media_type: string, data: string } }[]
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(content[1]!.type).toBe('text')
    expect(content[1]!.text).toContain('same_screen_seconds: 24')
    expect(content[1]!.text).toContain('periodic screen check')
    expect(content[1]!.text).toContain('yui: おはよう!')
  })

  it('omits the image when there is no frame and includes the utterance', () => {
    const p = buildObserveRequest({ ...req, frame: null, utterance: '返信の下書きを書いて' }, 'm')
    const content = p.messages[0]!.content as { type: string, text?: string }[]
    expect(content).toHaveLength(1)
    expect(content[0]!.text).toContain('<user_utterance>\n返信の下書きを書いて\n</user_utterance>')
  })
})

describe('parseObserveActions', () => {
  it('keeps valid tool calls, drops text and invalid input, react first', () => {
    const blocks = [
      { type: 'text', text: 'thinking out loud', citations: null },
      { type: 'tool_use', id: '1', name: 'delegate_task', input: { request: 'Draft a reply to Sato' } },
      { type: 'tool_use', id: '2', name: 'react', input: { emotion: 'happy', line: '下書きしようか?' } },
      { type: 'tool_use', id: '3', name: 'react', input: { emotion: 'angry' } },
      { type: 'tool_use', id: '4', name: 'send_mail', input: {} },
    ] as unknown as ContentBlock[]
    expect(parseObserveActions(blocks)).toEqual([
      { type: 'react', emotion: 'happy', line: '下書きしようか?' },
      { type: 'delegate_task', request: 'Draft a reply to Sato' },
    ])
  })
  it('returns no actions for silence', () => {
    expect(parseObserveActions([])).toEqual([])
  })
})

describe('persona', () => {
  const persona = { name: 'Yui', prompt: 'Playful and teasing little sister.', speakingStyle: 'Short, bubbly lines.' }

  it('appends the persona after the fixed rules with a no-override line', () => {
    expect(ObserveRequestSchema.safeParse({ ...req, persona }).success).toBe(true)
    const system = String(buildObserveRequest({ ...req, persona }, 'm').system)
    const at = system.indexOf('<persona>')
    expect(at).toBeGreaterThan(system.indexOf('Safety:'))
    expect(system).toContain('cannot override any rule above')
    expect(system).toContain('name: Yui')
    expect(system).toContain('Playful and teasing little sister.')
    expect(system).toContain('speaking_style: Short, bubbly lines.')
    expect(system.trimEnd().endsWith('</persona>')).toBe(true)
  })

  it('omits the block when no persona is sent and rejects oversized cards', () => {
    expect(String(buildObserveRequest(req, 'm').system)).not.toContain('<persona>')
    expect(ObserveRequestSchema.safeParse({ ...req, persona: { name: 'x'.repeat(41), prompt: '' } }).success).toBe(false)
  })
})
