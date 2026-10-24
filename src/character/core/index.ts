// Live2D core selection. pixi-live2d-display/cubism4 reads `window.Live2DCubismCore`, so
// the chosen core must be installed before that module is first imported.
//
//   ayagami  (default) Ayagami compiled to wasm (/vendor/ayagami.wasm) behind a
//            Live2DCubismCore-shaped facade.
//   official Live2D Cubism Core (/vendor/live2dcubismcore.min.js), loaded with a script tag.
//
// Selection: `?core=official|ayagami` query, else localStorage `yuiyumi.core`, else
// ayagami. If Ayagami fails to initialize, the official Core is used (logged once).
// The core is chosen once per page load; model switches reuse it.

export type CoreKind = 'ayagami' | 'official'

const STORAGE_KEY = 'yuiyumi.core'
const BASE = import.meta.env.BASE_URL
const AYAGAMI_WASM = `${BASE}vendor/ayagami.wasm`
const OFFICIAL_CORE = `${BASE}vendor/live2dcubismcore.min.js`

type CoreWindow = Window & { Live2DCubismCore?: unknown }

let ready: Promise<CoreKind> | null = null

const isCoreKind = (v: unknown): v is CoreKind => v === 'ayagami' || v === 'official'

export function requestedCore(): CoreKind {
  try {
    const q = new URLSearchParams(location.search).get('core')
    if (isCoreKind(q)) return q
    const s = localStorage.getItem(STORAGE_KEY)
    if (isCoreKind(s)) return s
  }
  catch { /* no location or storage */ }
  return 'ayagami'
}

/** Persists the core choice; takes effect on the next page load. */
export function setPreferredCore(kind: CoreKind): void {
  try { localStorage.setItem(STORAGE_KEY, kind) }
  catch { /* storage unavailable */ }
}

async function installAyagami(): Promise<void> {
  const res = await fetch(AYAGAMI_WASM)
  if (!res.ok) throw new Error(`${AYAGAMI_WASM}: HTTP ${res.status}`)
  const { createAyagamiCubismCore } = await import('./ayagami-cubism-core.mjs')
  // Overwrites an official Core defined by a static script tag, if any.
  ;(window as CoreWindow).Live2DCubismCore = await createAyagamiCubismCore(await res.arrayBuffer())
}

function installOfficial(): Promise<void> {
  const w = window as CoreWindow
  // Already defined by a static script tag (and not replaced by Ayagami).
  if (w.Live2DCubismCore && document.querySelector(`script[src="${OFFICIAL_CORE}"]`)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = OFFICIAL_CORE
    script.onload = () => (w.Live2DCubismCore ? resolve() : reject(new Error('Cubism Core loaded but not defined')))
    script.onerror = () => reject(new Error(`${OFFICIAL_CORE}: failed to load`))
    document.head.appendChild(script)
  })
}

/** Installs the selected core once; resolves to the core actually in use. Throws if none loads. */
export function ensureCubismCore(): Promise<CoreKind> {
  ready ??= (async (): Promise<CoreKind> => {
    if (requestedCore() === 'ayagami') {
      try {
        await installAyagami()
        return 'ayagami'
      }
      catch (e) {
        console.warn('[character] Ayagami core failed, falling back to the official Cubism Core:', e)
      }
    }
    await installOfficial()
    return 'official'
  })()
  ready.catch(() => { ready = null })
  return ready
}
