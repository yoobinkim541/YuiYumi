// Tiny syntax highlighter for the studio's code editor (HTML, CSS, JavaScript). Tolerates
// partial input (files are shown while being typed). Output is escaped HTML per line, so the
// editor can render it with v-html safely: every character of the source goes through escape().

import { extensionOf } from '@shared/studio'

export type CodeLang = 'html' | 'css' | 'js' | 'json' | 'text'

/** c comment, s string, k keyword, n number/literal, f function, t tag/selector, a attribute, p property, x punctuation */
export interface Token { c: string, v: string }

export function langOf(path: string): CodeLang {
  const ext = extensionOf(path)
  if (ext === 'html' || ext === 'svg') return 'html'
  if (ext === 'css') return 'css'
  if (ext === 'js') return 'js'
  if (ext === 'json') return 'json'
  return 'text'
}

export function escape(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch]!)
}

const JS_KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new class extends '
  + 'import export from default try catch finally throw typeof instanceof in of this async await yield delete void static get set').split(' '))
const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])

const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:\\[\s\S]|[^'\\\n])*'?|"(?:\\[\s\S]|[^"\\\n])*"?|`(?:\\[\s\S]|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?|([\s\S])/g

export function tokenizeJs(src: string): Token[] {
  const out: Token[] = []
  for (const m of src.matchAll(JS_RE)) {
    if (m[1] !== undefined) out.push({ c: 'c', v: m[1] })
    else if (m[2] !== undefined) out.push({ c: 's', v: m[2] })
    else if (m[3] !== undefined) out.push({ c: 'n', v: m[3] })
    else if (m[4] !== undefined) {
      const w = m[4]
      out.push({ c: JS_KEYWORDS.has(w) ? 'k' : JS_LITERALS.has(w) ? 'n' : m[5] ? 'f' : '', v: w })
      if (m[5]) out.push({ c: '', v: m[5] })
    } else out.push({ c: '', v: m[6]! })
  }
  return out
}

const CSS_RE = /(\/\*[\s\S]*?(?:\*\/|$))|('(?:\\[\s\S]|[^'\\\n])*'?|"(?:\\[\s\S]|[^"\\\n])*"?)|(@[\w-]+)|([{}])|(#[0-9a-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:[a-z%]+)?)|([\w-]+)(?=\s*:)|([\s\S])/g

export function tokenizeCss(src: string): Token[] {
  const out: Token[] = []
  let depth = 0
  for (const m of src.matchAll(CSS_RE)) {
    if (m[1] !== undefined) out.push({ c: 'c', v: m[1] })
    else if (m[2] !== undefined) out.push({ c: 's', v: m[2] })
    else if (m[3] !== undefined) out.push({ c: 'k', v: m[3] })
    else if (m[4] !== undefined) {
      depth += m[4] === '{' ? 1 : -1
      if (depth < 0) depth = 0
      out.push({ c: 'x', v: m[4] })
    } else if (m[5] !== undefined) out.push({ c: depth > 0 ? 'n' : 't', v: m[5] })
    else if (m[6] !== undefined) out.push({ c: depth > 0 ? 'p' : 't', v: m[6] })
    else out.push({ c: depth > 0 ? '' : 't', v: m[7]! })
  }
  return out
}

const ATTR_RE = /(\s+)|([^\s=>"'/]+)|(=)|("[^"]*"?|'[^']*'?)|(\/?>)|([\s\S])/g

export function tokenizeHtml(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      const j = end < 0 ? src.length : end + 3
      out.push({ c: 'c', v: src.slice(i, j) })
      i = j
      continue
    }
    const tag = /^<\/?([A-Za-z][\w-]*)|^<!doctype/i.exec(src.slice(i, i + 64))
    if (src[i] === '<' && tag) {
      out.push({ c: 'x', v: src[i]! + (src[i + 1] === '/' ? '/' : '') })
      const nameStart = i + (src[i + 1] === '/' ? 2 : 1)
      const name = tag[1] ?? tag[0].slice(1)
      out.push({ c: 't', v: src.slice(nameStart, nameStart + name.length) })
      i = nameStart + name.length
      // Attributes up to the closing '>' (or the end of the partial text).
      const close = src.indexOf('>', i)
      const attrEnd = close < 0 ? src.length : close + 1
      for (const m of src.slice(i, attrEnd).matchAll(ATTR_RE)) {
        if (m[1] !== undefined) out.push({ c: '', v: m[1] })
        else if (m[2] !== undefined) out.push({ c: 'a', v: m[2] })
        else if (m[3] !== undefined) out.push({ c: 'x', v: m[3] })
        else if (m[4] !== undefined) out.push({ c: 's', v: m[4] })
        else if (m[5] !== undefined) out.push({ c: 'x', v: m[5] })
        else out.push({ c: '', v: m[6]! })
      }
      i = attrEnd
      // Embedded script/style bodies use their own highlighter.
      const lower = name.toLowerCase()
      if (close >= 0 && src[nameStart - 1] !== '/' && (lower === 'script' || lower === 'style')) {
        const endTag = src.toLowerCase().indexOf(`</${lower}`, i)
        const bodyEnd = endTag < 0 ? src.length : endTag
        out.push(...(lower === 'script' ? tokenizeJs : tokenizeCss)(src.slice(i, bodyEnd)))
        i = bodyEnd
      }
      continue
    }
    const next = src.indexOf('<', i + 1)
    const j = next < 0 ? src.length : next
    out.push({ c: '', v: src.slice(i, j) })
    i = j
  }
  return out
}

export function tokenize(src: string, lang: CodeLang): Token[] {
  switch (lang) {
    case 'html': return tokenizeHtml(src)
    case 'css': return tokenizeCss(src)
    case 'js': case 'json': return tokenizeJs(src)
    default: return [{ c: '', v: src }]
  }
}

/** Escaped HTML for each line of `src` (spans split at line breaks). */
export function highlightLines(src: string, lang: CodeLang): string[] {
  const lines: string[] = ['']
  for (const t of tokenize(src, lang)) {
    const parts = t.v.split('\n')
    parts.forEach((part, k) => {
      if (k > 0) lines.push('')
      if (!part) return
      const html = escape(part)
      lines[lines.length - 1] += t.c ? `<span class="hl-${t.c}">${html}</span>` : html
    })
  }
  return lines
}
