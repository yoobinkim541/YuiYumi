import { describe, expect, it } from 'vitest'
import { buildSrcdoc, isPreviewMessage, PREVIEW_CSP, PREVIEW_MESSAGE_TAG, PREVIEW_SANDBOX, resolveLocal } from './srcdoc'

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`

describe('preview sandbox and CSP', () => {
  it('never grants same-origin, top navigation or popups', () => {
    const flags = PREVIEW_SANDBOX.split(/\s+/)
    expect(flags).toEqual(['allow-scripts', 'allow-forms', 'allow-modals'])
    expect(flags).not.toContain('allow-same-origin')
    expect(PREVIEW_SANDBOX).not.toMatch(/top-navigation|popups/)
  })

  it('blocks every network request', () => {
    expect(PREVIEW_CSP).toContain("default-src 'none'")
    expect(PREVIEW_CSP).toContain("script-src 'unsafe-inline'")
    expect(PREVIEW_CSP).toContain("style-src 'unsafe-inline'")
    expect(PREVIEW_CSP).toContain('img-src data: blob:')
    expect(PREVIEW_CSP).toContain("connect-src 'none'")
    expect(PREVIEW_CSP).not.toMatch(/https?:|\*/)
  })
})

describe('buildSrcdoc', () => {
  const files = {
    'index.html': '<!DOCTYPE html>\n<html lang="ko"><head><title>Todo</title><link rel="stylesheet" href="style.css"></head>'
      + '<body><h1>할 일</h1><script src="./app.js"></script></body></html>',
    'style.css': 'body { color: red }',
    'app.js': 'document.title = "</script><script>alert(1)"; // <!-- x',
  }

  it('puts the CSP and prelude first, right after the doctype', () => {
    const out = buildSrcdoc(files)
    expect(out.startsWith(`<!DOCTYPE html>${CSP_META}<script>`)).toBe(true)
    // Before anything the app wrote.
    expect(out.indexOf(CSP_META)).toBeLessThan(out.indexOf('<html lang="ko">'))
  })

  it('inlines local style sheets and scripts, escaping closing tags', () => {
    const out = buildSrcdoc(files)
    expect(out).toContain('<style data-file="style.css">\nbody { color: red }\n</style>')
    expect(out).not.toContain('href="style.css"')
    expect(out).toContain('<script data-file="app.js">\ndocument.title = "<\\/script><script>alert(1)"; // <\\!-- x\n</script>')
    expect(out).not.toMatch(/src="\.\/app\.js"/)
  })

  it('removes external scripts, style sheets and preconnects', () => {
    const out = buildSrcdoc({
      'index.html': '<!doctype html><head><link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="https://cdn.example/x.css">'
        + '<script src="https://cdn.example/lib.js" integrity="sha-1"></script><script src="//evil.example/x.js"></script><script src="missing.js"></script></head>'
        + '<body><script>window.ok = 1</script></body>',
    })
    expect(out).not.toMatch(/cdn\.example|evil\.example|gstatic|missing\.js/)
    expect(out).toContain('<script>window.ok = 1</script>')
  })

  it('turns local SVG images into data URLs and drops redirects and base tags', () => {
    const out = buildSrcdoc({
      'index.html': '<!doctype html><meta http-equiv="refresh" content="0;url=https://x.example"><base href="https://x.example/"><img src="img/logo.svg" alt=""><img src="https://x.example/a.png">',
      'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    })
    expect(out).toContain('src="data:image/svg+xml;charset=utf-8,%3Csvg')
    expect(out).not.toMatch(/http-equiv="refresh"|<base/)
    // Remote images stay in the markup; the CSP blocks them.
    expect(out).toContain('https://x.example/a.png')
  })

  it('adds a doctype when missing, so a comment containing <head> cannot push the CSP away', () => {
    const out = buildSrcdoc({ 'index.html': '<!-- <head> --><html><head></head><body>x</body></html>' })
    expect(out.startsWith(`<!doctype html>${CSP_META}`)).toBe(true)
  })

  it('shows a listing when the entry is missing', () => {
    const out = buildSrcdoc({ 'app.js': '1', 'a<b>.css': '' }, 'index.html')
    expect(out).toContain('index.html not found.')
    expect(out).toContain('a&lt;b&gt;.css')
    expect(out).toContain(CSP_META)
  })

  it('resolves relative references against the entry', () => {
    const f = { 'index.html': '', 'css/a.css': '', 'pages/b.html': '' }
    expect(resolveLocal('css/a.css?v=1', 'index.html', f)).toBe('css/a.css')
    expect(resolveLocal('../css/a.css', 'pages/b.html', f)).toBe('css/a.css')
    expect(resolveLocal('/css/a.css', 'pages/b.html', f)).toBe('css/a.css')
    expect(resolveLocal('https://x/css/a.css', 'index.html', f)).toBeNull()
    expect(resolveLocal('data:text/css,x', 'index.html', f)).toBeNull()
    expect(resolveLocal('nope.css', 'index.html', f)).toBeNull()
  })

  it('accepts only well-formed preview messages', () => {
    expect(isPreviewMessage({ tag: PREVIEW_MESSAGE_TAG, kind: 'ready' })).toBe(true)
    expect(isPreviewMessage({ tag: PREVIEW_MESSAGE_TAG, kind: 'error', message: 'x' })).toBe(true)
    expect(isPreviewMessage({ tag: PREVIEW_MESSAGE_TAG, kind: 'error', message: 1 })).toBe(false)
    expect(isPreviewMessage({ tag: 'other', kind: 'ready' })).toBe(false)
    expect(isPreviewMessage('ready')).toBe(false)
  })
})
