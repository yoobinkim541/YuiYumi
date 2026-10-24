// Builds the srcdoc of the browser window from a studio project. The generated app runs only
// inside an iframe sandboxed WITHOUT allow-same-origin (opaque origin: no access to this page,
// its storage or cookies), with a CSP that blocks every network request. Local style sheets,
// scripts and SVG images are inlined; external ones are removed.

import { extensionOf } from '@shared/studio'

/** iframe sandbox flags. Never add allow-same-origin, allow-top-navigation or allow-popups. */
export const PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals'

/** No network at all: inline scripts and styles, data:/blob: images, fonts and media only. */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

/** Marker on messages the preview posts to the parent (runtime errors, ready). */
export const PREVIEW_MESSAGE_TAG = 'yuiyumi-studio'

export type PreviewMessage =
  | { tag: typeof PREVIEW_MESSAGE_TAG, kind: 'ready' }
  | { tag: typeof PREVIEW_MESSAGE_TAG, kind: 'error', message: string }

/**
 * Runs first in the page: storage stand-ins (an opaque origin has no localStorage, and
 * touching it throws) and runtime error reporting to the parent window.
 */
const PRELUDE = `(function(){
var T=${JSON.stringify(PREVIEW_MESSAGE_TAG)};
function post(m){try{parent.postMessage(m,'*')}catch(e){}}
function mem(){var d=Object.create(null);return{getItem:function(k){k=String(k);return k in d?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d=Object.create(null)},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
window.addEventListener('error',function(e){post({tag:T,kind:'error',message:String(e.message||'Error')+(e.lineno?' (line '+e.lineno+')':'')})});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;post({tag:T,kind:'error',message:'Unhandled promise rejection: '+String(r&&r.message||r)})});
window.addEventListener('load',function(){post({tag:T,kind:'ready'})});
})();`

/** Resolves a reference from the entry file to a project path, or null when not local. */
export function resolveLocal(ref: string, entry: string, files: Record<string, string>): string | null {
  const raw = ref.trim()
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('#')) return null
  const clean = raw.split(/[?#]/)[0]!
  const base = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''
  const parts: string[] = []
  for (const seg of (clean.startsWith('/') ? clean.slice(1) : base + clean).split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  const path = parts.join('/')
  return path in files ? path : null
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

function dropAttr(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, 'gi'), '')
}

/** Keeps inlined code from closing its own element early. */
const escapeScript = (s: string) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
const escapeStyle = (s: string) => s.replace(/<\/style/gi, '<\\/style')
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

function dataUrl(path: string, content: string): string | null {
  return extensionOf(path) === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}` : null
}

function fallbackPage(files: Record<string, string>, entry: string): string {
  const list = Object.keys(files).map(f => `<li>${escapeHtml(f)}</li>`).join('')
  return `<!doctype html><html><head><title>${escapeHtml(entry)}</title></head><body style="font-family:system-ui,sans-serif;color:#555;padding:32px"><p>${escapeHtml(entry)} not found.</p><ul>${list}</ul></body></html>`
}

/** srcdoc for the browser window: entry HTML with local assets inlined, CSP and prelude first. */
export function buildSrcdoc(files: Record<string, string>, entry = 'index.html'): string {
  let html = files[entry] ?? fallbackPage(files, entry)

  // Style sheets: local ones inlined, everything else (external CSS, preconnect, icons) removed.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    const href = attr(tag, 'href') ?? ''
    const local = resolveLocal(href, entry, files)
    if (rel.split(/\s+/).includes('stylesheet') && local && extensionOf(local) === 'css') {
      return `<style data-file="${escapeHtml(local)}">\n${escapeStyle(files[local]!)}\n</style>`
    }
    return ''
  })

  // Scripts: local src inlined, external src removed, inline scripts kept.
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs: string) => {
    const src = attr(`<s${attrs}>`, 'src')
    if (src === null) return whole
    const local = resolveLocal(src, entry, files)
    if (!local || extensionOf(local) !== 'js') return ''
    return `<script${dropAttr(dropAttr(attrs, 'src'), 'integrity')} data-file="${escapeHtml(local)}">\n${escapeScript(files[local]!)}\n</script>`
  })

  // Local SVG images become data: URLs; other src values stay (the CSP blocks remote ones).
  html = html.replace(/(<(?:img|image|source)\b[^>]*?\s(?:src|href)\s*=\s*)(["'])([^"']*)\2/gi, (whole, head: string, q: string, ref: string) => {
    const local = resolveLocal(ref, entry, files)
    const url = local ? dataUrl(local, files[local]!) : null
    return url ? `${head}${q}${url}${q}` : whole
  })

  // No redirects or base URL games.
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '')

  // CSP and prelude go right after the doctype, before anything the app wrote (comments
  // included): the parser opens <head> for them, keeps standards mode, and merges the app's own
  // <html lang> attributes; its later <head> tag is ignored.
  const first = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><script>${PRELUDE}</script>`
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)
  return doctype ? `${doctype[0]}${first}${html.slice(doctype[0].length)}` : `<!doctype html>${first}${html}`
}

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return typeof data === 'object' && data !== null && (data as { tag?: unknown }).tag === PREVIEW_MESSAGE_TAG
    && ((data as { kind?: unknown }).kind === 'ready' || ((data as { kind?: unknown }).kind === 'error' && typeof (data as { message?: unknown }).message === 'string'))
}
