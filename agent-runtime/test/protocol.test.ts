import { describe, expect, it } from 'vitest'
import { encodeSse, SseParser, type AgentEvent } from '../src/protocol.ts'
import { extractSay, firstSentence, voiceAppendix } from '../src/prompt.ts'

const a: AgentEvent = { type: 'text', text: 'line one\nline two' }
const b: AgentEvent = { type: 'tool_start', id: 't1', name: 'Bash', grade: 'shell', summary: 'ls' }

describe('SseParser', () => {
  it('round-trips encoded events with their sequence numbers', () => {
    const p = new SseParser()
    expect(p.feed(encodeSse(1, a) + encodeSse(2, b))).toEqual([{ seq: 1, event: a }, { seq: 2, event: b }])
  })

  it('reassembles frames split at any byte', () => {
    const wire = `: connected\n\n${encodeSse(7, a)}: ping\n\n${encodeSse(8, b)}`
    for (let cut = 1; cut < wire.length; cut++) {
      const p = new SseParser()
      const got = [...p.feed(wire.slice(0, cut)), ...p.feed(wire.slice(cut))]
      expect(got.map(e => e.seq)).toEqual([7, 8])
    }
  })

  it('accepts CRLF, multi-line data and frames without id', () => {
    const p = new SseParser()
    const got = p.feed('data: {"type":"notice",\r\ndata: "text":"hi"}\r\n\r\n')
    expect(got).toEqual([{ seq: -1, event: { type: 'notice', text: 'hi' } }])
  })

  it('waits for the second half of a CRLF split across chunks', () => {
    const p = new SseParser()
    expect(p.feed('id: 3\r\ndata: {"type":"status","state":"idle"}\r\n\r')).toEqual([])
    expect(p.feed('\n')).toEqual([{ seq: 3, event: { type: 'status', state: 'idle' } }])
  })

  it('skips comments, empty frames and malformed JSON', () => {
    const p = new SseParser()
    expect(p.feed(': ping\n\nid: 4\n\ndata: {oops\n\ndata: 12\n\n')).toEqual([])
  })
})

describe('spoken summary lines', () => {
  it('splits SAY lines out of the transcript text', () => {
    const r = extractSay('SAY: I will create the file now.\n\nCreating `hello.txt`.\n\n**SAY:** Done, the file is there.')
    expect(r.say).toEqual(['I will create the file now.', 'Done, the file is there.'])
    expect(r.text).toBe('Creating `hello.txt`.')
  })

  it('leaves text without SAY lines alone and ignores SAY in the middle of a line', () => {
    expect(extractSay('We could SAY: hello here.')).toEqual({ text: 'We could SAY: hello here.', say: [] })
  })

  it('falls back to the first sentence without code or markdown', () => {
    expect(firstSentence('**Done.** Created hello.txt with `hi`.')).toBe('Done.')
    expect(firstSentence('```\ncode\n```\nAll tests pass! More text.')).toBe('All tests pass!')
    expect(firstSentence('完了しました。次は何をする？')).toBe('完了しました。')
  })

  it('appendix names the persona and the language', () => {
    const t = voiceAppendix({ lang: 'ko', persona: { name: 'Yui', speakingStyle: 'cheerful' } })
    expect(t).toContain('through Yui')
    expect(t).toContain('SAY lines in Korean, in the voice of Yui')
    expect(t).toContain('Speaking style: cheerful')
  })
})
