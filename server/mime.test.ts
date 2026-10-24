import { describe, expect, it } from 'vitest'
import { buildMime, decodeEncodedWords, encodeWord, guessLang, htmlToText, parseAddressList, parseGmailMessage, toRaw, type GmailMessage } from './mime.js'

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')

describe('MIME building', () => {
  it('keeps ASCII subjects and encodes CJK subjects as RFC 2047 words of at most 75 chars', () => {
    expect(encodeWord('Hello there')).toBe('Hello there')
    const subject = '[일정 문의] 다음 Orbit 미팅 일정 관련 — 見積もりの件について、ご確認をお願いします'
    const enc = encodeWord(subject)
    const words = enc.split('\r\n ')
    expect(words.length).toBeGreaterThan(1)
    for (const w of words) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
      expect(w.length).toBeLessThanOrEqual(75)
    }
    expect(decodeEncodedWords(enc.replace(/\r\n /g, ' '))).toBe(subject)
  })

  it('builds a UTF-8 base64 message with encoded display names and threading headers', () => {
    const mime = buildMime({
      to: '정하은 <haeun@example.com>, "Kim, J" <j@example.com>',
      subject: 'Re: 見積もり',
      body: '안녕하세요\n감사합니다',
      inReplyTo: '<a@x>',
      references: '<z@x> <a@x>',
    })
    const [head, body] = mime.split('\r\n\r\n')
    expect(head).toContain('To: =?UTF-8?B?')
    expect(head).toContain('"Kim, J" <j@example.com>')
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(head).toContain('Content-Transfer-Encoding: base64')
    expect(head).toContain('In-Reply-To: <a@x>')
    expect(head).toContain('References: <z@x> <a@x>')
    expect(Buffer.from(body!.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('안녕하세요\r\n감사합니다')
    // Gmail raw is base64url of the whole message.
    expect(Buffer.from(toRaw(mime), 'base64url').toString('utf8')).toBe(mime)
  })

  it('strips line breaks from header values (no header injection)', () => {
    const mime = buildMime({ to: 'a@example.com', subject: 'Hi\r\nBcc: victim@example.com', body: 'x' })
    expect(mime.split('\r\n\r\n')[0]).not.toMatch(/^Bcc:/m)
  })

  it('parses address lists with quotes and angle brackets', () => {
    expect(parseAddressList('A <a@x.io>, "B, Jr" <b@x.io>; c@x.io')).toEqual([
      { name: 'A', email: 'a@x.io' }, { name: 'B, Jr', email: 'b@x.io' }, { name: '', email: 'c@x.io' },
    ])
  })
})

describe('Gmail message parsing', () => {
  const msg = (payload: GmailMessage['payload'], labelIds = ['INBOX', 'UNREAD']): GmailMessage =>
    ({ id: 'm1', threadId: 't1', labelIds, internalDate: String(Date.UTC(2026, 9, 24, 1, 0)), payload })

  it('prefers text/plain in multipart/alternative and decodes headers', () => {
    const p = parseGmailMessage(msg({
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: '=?UTF-8?B?7KCV7ZWY7J2A?= <haeun@example.com>' },
        { name: 'To', value: 'me@example.com' },
        { name: 'Subject', value: '=?UTF-8?B?7J287KCVIOusuOydmA==?=' },
        { name: 'Message-ID', value: '<abc@example.com>' },
      ],
      parts: [
        { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=UTF-8' }], body: { data: b64url('안녕하세요\r\n본문') } },
        { mimeType: 'text/html', body: { data: b64url('<p>HTML</p>') } },
      ],
    }))
    expect(p).toMatchObject({ id: 'm1', threadId: 't1', from: '정하은 <haeun@example.com>', subject: '일정 문의', messageId: '<abc@example.com>', body: '안녕하세요\n본문', lang: 'ko' })
    expect(p.date).toBe('2026-10-24T01:00:00.000Z')
    expect(p.labels.has('UNREAD')).toBe(true)
  })

  it('falls back to stripped HTML and skips attachments', () => {
    const p = parseGmailMessage(msg({
      mimeType: 'multipart/mixed',
      headers: [{ name: 'Subject', value: 'Invoice' }],
      parts: [
        { mimeType: 'text/plain', filename: 'notes.txt', body: { attachmentId: 'att' } },
        { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64url('<html><style>p{}</style><p>Hello &amp; welcome</p><p>Line&nbsp;2<br>3</p></html>') } }] },
      ],
    }))
    expect(p.body).toBe('Hello & welcome\nLine 2\n3')
    expect(p.lang).toBe('en')
  })

  it('decodes legacy charsets declared on the part', () => {
    const sjis = Buffer.from([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]) // こんにちは in Shift_JIS
    const p = parseGmailMessage(msg({ mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="Shift_JIS"' }], body: { data: sjis.toString('base64url') } }))
    expect(p.body).toBe('こんにちは')
    expect(p.lang).toBe('ja')
  })

  it('guesses the language from the script', () => {
    expect(guessLang('這個會議時間')).toBe('zh-Hant')
    expect(guessLang('这个会议时间')).toBe('zh-Hans')
    expect(htmlToText('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
  })
})
