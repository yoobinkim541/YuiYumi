// RFC 5322 / MIME helpers for Gmail: building UTF-8 messages (RFC 2047 encoded-word headers,
// base64 bodies) and parsing Gmail API message payloads back into plain text.

export interface Address { name: string, email: string }

const ASCII_PRINTABLE = /^[\x20-\x7e]*$/
const EMAIL = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/

/** Header values never carry line breaks (prevents header injection). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

/** RFC 2047 "B" encoded words for non-ASCII text, each word at most 75 characters. */
export function encodeWord(text: string): string {
  const s = oneLine(text)
  if (ASCII_PRINTABLE.test(s)) return s
  // 75 - "=?UTF-8?B?" - "?=" = 63 base64 chars -> at most 45 bytes per word, split on code points.
  const words: string[] = []
  let chunk = ''
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) { words.push(chunk); chunk = '' }
    chunk += ch
  }
  if (chunk) words.push(chunk)
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ')
}

/** Splits "A <a@x>, \"B, Jr\" <b@x>, c@x" into addresses (quotes and angle brackets respected). */
export function parseAddressList(value: string): Address[] {
  const parts: string[] = []
  let cur = ''
  let quoted = false
  let angle = false
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    else if (ch === '<' && !quoted) angle = true
    else if (ch === '>' && !quoted) angle = false
    if ((ch === ',' || ch === ';') && !quoted && !angle) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(Boolean).map((p) => {
    const m = /^(.*?)<([^>]+)>\s*$/.exec(p)
    if (m) return { name: m[1]!.trim().replace(/^"(.*)"$/, '$1').trim(), email: m[2]!.trim() }
    return { name: '', email: p.replace(/^"(.*)"$/, '$1').trim() }
  })
}

export const isEmail = (s: string) => EMAIL.test(s)

/** One address for a header: encoded or quoted display name plus the angle address. */
export function formatAddress(a: Address): string {
  if (!a.name) return a.email
  const name = ASCII_PRINTABLE.test(a.name)
    ? (/[()<>@,;:\\".[\]]/.test(a.name) ? `"${a.name.replace(/["\\]/g, '\\$&')}"` : a.name)
    : encodeWord(a.name)
  return `${name} <${a.email}>`
}

export interface OutgoingMail {
  to: string
  subject: string
  body: string
  from?: string
  replyTo?: string
  date?: Date
  messageId?: string
  inReplyTo?: string
  references?: string
  /** Extra X- headers (ASCII values). */
  extra?: Record<string, string>
}

/** Full RFC 5322 message: UTF-8 text/plain, base64 body in 76-column lines, CRLF endings. */
export function buildMime(m: OutgoingMail): string {
  const addr = (v: string) => parseAddressList(oneLine(v)).map(formatAddress).join(', ')
  const headers: string[] = []
  if (m.from) headers.push(`From: ${addr(m.from)}`)
  headers.push(`To: ${addr(m.to)}`)
  if (m.replyTo) headers.push(`Reply-To: ${addr(m.replyTo)}`)
  headers.push(`Subject: ${encodeWord(m.subject)}`)
  if (m.date) headers.push(`Date: ${m.date.toUTCString().replace('GMT', '+0000')}`)
  if (m.messageId) headers.push(`Message-ID: ${oneLine(m.messageId)}`)
  if (m.inReplyTo) headers.push(`In-Reply-To: ${oneLine(m.inReplyTo)}`)
  if (m.references) headers.push(`References: ${oneLine(m.references)}`)
  for (const [k, v] of Object.entries(m.extra ?? {})) headers.push(`${k}: ${oneLine(v)}`)
  headers.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64')
  const body = Buffer.from(m.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`
}

/** Gmail `raw`: the whole message as base64url. */
export const toRaw = (mime: string) => Buffer.from(mime, 'utf8').toString('base64url')

// ---------------------------------------------------------------------------
// Parsing

function decodeBytes(bytes: Buffer, charset = 'utf-8'): string {
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes) } catch { return bytes.toString('utf8') }
}

/** Decodes RFC 2047 encoded words ("=?UTF-8?B?...?=", "=?ISO-2022-JP?B?...?=", Q encoding). */
export function decodeEncodedWords(value: string): string {
  if (!value.includes('=?')) return value
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64')
        : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
      return decodeBytes(bytes, charset.split('*')[0])
    })
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\'' }

/** Plain text from an HTML mail body: blocks become line breaks, tags and scripts go. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Best guess of the mail language from its script (hangul, kana, han, else English). */
export function guessLang(text: string): string {
  if (/[\uac00-\ud7a3]/.test(text)) return 'ko'
  if (/[\u3040-\u30ff]/.test(text)) return 'ja'
  if (/[\u4e00-\u9fff]/.test(text)) {
    const trad = (text.match(/[這們說時會為來個國對與發經過門開關學點]/g) ?? []).length
    const simp = (text.match(/[这们说时会为来个国对与发经过门开关学点]/g) ?? []).length
    return trad > simp ? 'zh-Hant' : 'zh-Hans'
  }
  return 'en'
}

interface GmailHeader { name: string, value: string }
export interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string, size?: number, attachmentId?: string }
  parts?: GmailPart[]
}
export interface GmailMessage {
  id: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart
}

export interface ParsedMail {
  id: string
  threadId: string
  labels: Set<string>
  from: string
  to: string
  replyTo: string
  subject: string
  messageId: string
  inReplyTo: string
  references: string
  /** internalDate as ISO 8601. */
  date: string
  body: string
  lang: string
}

const header = (part: GmailPart | undefined, name: string) =>
  decodeEncodedWords(part?.headers?.find(h => h.name.toLowerCase() === name)?.value ?? '').trim()

function charsetOf(part: GmailPart): string | undefined {
  return /charset="?([^";\s]+)"?/i.exec(header(part, 'content-type'))?.[1]
}

/** Gmail returns part bodies as base64url of the transfer-decoded bytes. */
function partText(part: GmailPart): string {
  const data = part.body?.data
  return data ? decodeBytes(Buffer.from(data, 'base64url'), charsetOf(part)) : ''
}

function findPart(part: GmailPart | undefined, type: string): GmailPart | null {
  if (!part) return null
  if (part.mimeType?.toLowerCase() === type && !part.filename && part.body?.data) return part
  for (const p of part.parts ?? []) {
    const hit = findPart(p, type)
    if (hit) return hit
  }
  return null
}

/** Message body as text: prefers text/plain, falls back to stripped text/html. */
export function messageBody(payload: GmailPart | undefined): string {
  const plain = findPart(payload, 'text/plain')
  if (plain) return partText(plain).replace(/\r\n/g, '\n').trim()
  const html = findPart(payload, 'text/html')
  return html ? htmlToText(partText(html)) : ''
}

export function parseGmailMessage(msg: GmailMessage): ParsedMail {
  const p = msg.payload
  const subject = header(p, 'subject')
  const body = messageBody(p)
  const date = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(header(p, 'date') || Date.now())
  return {
    id: msg.id,
    threadId: msg.threadId ?? '',
    labels: new Set(msg.labelIds ?? []),
    from: header(p, 'from'),
    to: header(p, 'to'),
    replyTo: header(p, 'reply-to'),
    subject,
    messageId: header(p, 'message-id'),
    inReplyTo: header(p, 'in-reply-to'),
    references: header(p, 'references'),
    date: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
    body,
    lang: header(p, 'x-yuiyumi-lang') || guessLang(`${subject}\n${body}`),
  }
}
