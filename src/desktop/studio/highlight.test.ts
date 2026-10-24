import { describe, expect, it } from 'vitest'
import { highlightLines, langOf, tokenize } from './highlight'

describe('studio highlighter', () => {
  it('escapes everything it outputs', () => {
    const html = highlightLines('<img src=x onerror="alert(1)">\n<script>const s = "</b>&";</script>', 'html').join('\n')
    expect(html).not.toMatch(/<img|<script|<\/b>/)
    expect(html).toContain('&lt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    // Only our own spans remain as markup.
    expect(html.replace(/<span class="hl-[a-z]">|<\/span>/g, '')).not.toMatch(/[<>]/)
  })

  it('round-trips the source text and splits lines', () => {
    const src = '/* a\nb */\nfunction add(a, b) {\n  return a + b // sum\n}\n'
    const lines = highlightLines(src, 'js')
    expect(lines).toHaveLength(6)
    const plain = lines.map(l => l.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('\n')
    expect(plain).toBe(src)
    expect(lines[0]).toBe('<span class="hl-c">/* a</span>')
    expect(lines[2]).toContain('<span class="hl-k">function</span> <span class="hl-f">add</span>')
  })

  it('classifies CSS selectors, properties and values', () => {
    const t = tokenize('.card:hover { color: #fff; padding: 12px }', 'css').filter(x => x.c)
    expect(t).toEqual(expect.arrayContaining([
      { c: 't', v: 'card' }, { c: 'p', v: 'color' }, { c: 'n', v: '#fff' }, { c: 'p', v: 'padding' }, { c: 'n', v: '12px' },
    ]))
  })

  it('tolerates partial input while typing', () => {
    for (const [src, lang] of [['<div class="a', 'html'], ['const s = "unterminated', 'js'], ['/* open', 'css'], ['<script>let x = 1', 'html']] as const) {
      const lines = highlightLines(src, lang)
      expect(lines.join('').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).toBe(src)
    }
  })

  it('picks the language from the extension', () => {
    expect([langOf('index.html'), langOf('a/b.css'), langOf('app.js'), langOf('x.json'), langOf('logo.svg'), langOf('notes.md')])
      .toEqual(['html', 'css', 'js', 'json', 'html', 'text'])
  })
})
