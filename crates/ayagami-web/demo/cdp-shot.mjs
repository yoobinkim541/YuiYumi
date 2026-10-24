// Spike helper: open a URL in headless Chrome over CDP, wait until the page's
// #status reports enough frames (or an error), then save a screenshot.
// Usage: node demo/cdp-shot.mjs <url> <out.png> [port]
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, out, port = '9333', rawOut] = process.argv.slice(2)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ayg-cdp-'))}`,
  '--no-first-run', '--window-size=720,960', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const logs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + m.params.exceptionDetails.exception?.description)
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url })
let status = ''
const t0 = Date.now()
while (Date.now() - t0 < 120000) {
  await sleep(1000)
  const r = await send('Runtime.evaluate', { expression: "document.getElementById('status')?.textContent ?? ''" })
  status = r.result?.result?.value ?? ''
  const fm = status.match(/frames (\d+)/)
  if (status.startsWith('ERROR') || (fm && +fm[1] >= 240)) break
}
if (rawOut) {
  // Raw RGBA of the rendered stage (renderer.extract re-renders into a texture).
  const r = await send('Runtime.evaluate', { expression: `(() => { const p = __app.renderer.extract.pixels(__app.stage); let s = ''; for (let i = 0; i < p.length; i += 8192) s += String.fromCharCode.apply(null, p.subarray(i, i + 8192)); return btoa(s) })()` })
  writeFileSync(rawOut, Buffer.from(r.result.result.value, 'base64'))
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('status:', status.replace(/\n/g, ' | '))
console.log('logs:', logs.filter((l) => !l.startsWith('[vite]')).slice(-8).join('\n  '))
ws.close()
chrome.kill()
process.exit(0)
