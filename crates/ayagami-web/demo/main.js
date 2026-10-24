// Spike page: render a model through pixi-live2d-display (Cubism 4 framework)
// + cubism-web-batched-renderer, with either the official Cubism Core
// (?core=official) or the Ayagami facade (default) as `Live2DCubismCore`.
import * as PIXI from 'pixi.js'
import wasmUrl from '../target/wasm32-unknown-unknown/release/ayagami_web.wasm?url'
import { createAyagamiCubismCore } from '../js/ayagami-cubism-core.mjs'
import { installCubismBatchedRenderer } from 'cubism-web-batched-renderer'

const params = new URLSearchParams(location.search)
const coreKind = params.get('core') ?? 'ayagami'
const modelUrl = params.get('model') ?? `/@fs${import.meta.env.VITE_MODEL_DIR ?? ''}/TT2.0.model3.json`
const status = document.getElementById('status')
const log = (s) => { status.textContent = s; console.log('[spike] ' + s.replace(/\n/g, ' | ')) }

const origWarn = console.warn
console.warn = (...a) => { origWarn(...a); if (String(a[0]).includes('[Live2D]')) window.__fallback = String(a[0]) }
window.addEventListener('error', (e) => log('ERROR ' + e.message))
window.addEventListener('unhandledrejection', (e) => log('ERROR ' + (e.reason?.stack ?? e.reason)))

async function main() {
  if (coreKind === 'official') {
    await new Promise((ok, fail) => {
      const s = document.createElement('script')
      s.src = '/vendor/live2dcubismcore.min.js'
      s.onload = ok
      s.onerror = fail
      document.head.appendChild(s)
    })
    await new Promise((r) => setTimeout(r, 200))
  } else {
    window.Live2DCubismCore = await createAyagamiCubismCore(await (await fetch(wasmUrl)).arrayBuffer())
  }
  window.PIXI = PIXI
  PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2
  const { Live2DModel } = await import('pixi-live2d-display/cubism4')

  const app = new PIXI.Application({ width: 720, height: 960, backgroundColor: 0x556677, antialias: false })
  document.body.appendChild(app.view)
  window.__app = app
  const t0 = performance.now()
  const model = await Live2DModel.from(modelUrl, { autoInteract: false })
  const loadMs = performance.now() - t0
  installCubismBatchedRenderer(model.internalModel)
  const scale = Math.min(app.view.width / model.width, app.view.height / model.height)
  model.scale.set(scale)
  model.x = (app.view.width - model.width) / 2
  app.stage.addChild(model)

  // Measure the core update cost inside the framework's update.
  const core = model.internalModel.coreModel
  const inner = core._model
  let upd = 0, n = 0
  const orig = inner.update.bind(inner)
  inner.update = () => { const t = performance.now(); orig(); upd += performance.now() - t; n++ }

  const freeze = params.has('freeze')
  if (freeze) {
    // Deterministic pose for pixel comparison: no motions, physics, blink or breath.
    const im = model.internalModel
    im.motionManager.update = () => false
    im.eyeBlink = undefined
    im.physics = undefined
    im.breath = undefined
  }
  const gl = app.renderer.gl
  let frames = 0
  app.ticker.add(() => {
    frames++
    // Drive the head so the deformation is visible in the screenshot.
    const t = freeze ? 0.4 : performance.now() / 1000
    core.setParameterValueById('ParamAngleX', 30 * Math.sin(t * 2))
    core.setParameterValueById('ParamMouthOpenY', 0.5 + 0.5 * Math.sin(t * 7))
    if (frames % 30 === 0)
      log(`${window.__fallback ? 'FALLBACK ' + window.__fallback + '\n' : 'batched=yes '}core=${coreKind} webgl2=${gl instanceof WebGL2RenderingContext}\nload ${loadMs.toFixed(0)} ms, frames ${frames}\ncore update ${(upd / Math.max(n, 1)).toFixed(3)} ms avg\ndrawables ${inner.drawables.count}`)
  })
}
main()
