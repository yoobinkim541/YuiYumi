// Loads an encrypted model pack: GET /api/model-key, GET <pack>.bin (12-byte IV ||
// AES-GCM ciphertext+tag), decrypt with WebCrypto, unzip with JSZip. Files the SDK loads
// get object URLs (see `resolveURL`); JSON side files are read directly.
// This deters casual scraping only: the key necessarily reaches the browser.

import JSZip from 'jszip'
import { apiUrl } from '@/core/api'

export interface ModelPack {
  /** model3 settings JSON (relative paths, no Expressions) with a synthetic `url`. */
  model3: Record<string, unknown> & { url: string }
  /**
   * Maps a model3 file reference to its object URL. Installed as the settings'
   * resolveURL: the library's own URL resolution mangles `blob:` URLs.
   */
  resolveURL(path: string): string
  /** Original model3 Expressions (relative paths inside the pack). */
  expressions: { Name: string, File: string }[]
  json<T>(path: string): Promise<T | null>
  /** Revokes every object URL created for this pack. */
  revoke(): void
}

let keyPromise: Promise<CryptoKey> | null = null

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function modelKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const res = await fetch(apiUrl('/api/model-key'), { cache: 'no-store' })
    if (!res.ok) throw new Error(`model key: HTTP ${res.status}`)
    const { key } = await res.json() as { key?: string }
    if (!key) throw new Error('model key: empty response')
    return crypto.subtle.importKey('raw', b64ToBytes(key), 'AES-GCM', false, ['decrypt'])
  })()
  keyPromise.catch(() => { keyPromise = null })
  return keyPromise
}

const MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp', json: 'application/json' }

export async function loadModelPack(url: string, id: string): Promise<ModelPack> {
  const [key, res] = await Promise.all([modelKey(), fetch(url)])
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  if (data.byteLength < 12 + 16) throw new Error(`${url}: pack too small`)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) }, key, data.subarray(12))
  const zip = await JSZip.loadAsync(plain)

  const settingsPath = Object.keys(zip.files).find(p => p.endsWith('.model3.json'))
  if (!settingsPath) throw new Error(`${url}: no model3.json in pack`)
  const settings = JSON.parse(await zip.file(settingsPath)!.async('text'))
  const refs = settings.FileReferences ?? {}

  const urls: string[] = []
  const byPath = new Map<string, string>()
  const toUrl = async (path: string): Promise<string> => {
    const file = zip.file(path)
    if (!file) throw new Error(`${url}: missing ${path}`)
    const ext = path.split('.').pop() ?? ''
    const blob = new Blob([await file.async('arraybuffer')], { type: MIME[ext] ?? 'application/octet-stream' })
    const u = URL.createObjectURL(blob)
    urls.push(u)
    byPath.set(path, u)
    return u
  }

  await toUrl(refs.Moc)
  await Promise.all((refs.Textures as string[]).map(toUrl))
  if (refs.Physics) await toUrl(refs.Physics)
  if (refs.Pose) await toUrl(refs.Pose)
  for (const list of Object.values((refs.Motions ?? {}) as Record<string, { File: string }[]>)) {
    for (const m of list) if (!byPath.has(m.File)) await toUrl(m.File)
  }
  // Expressions are applied by our own layer (read from the pack), not by the SDK.
  const { Expressions: _expressions, DisplayInfo: _cdi, ...sdkRefs } = refs

  return {
    model3: { ...settings, FileReferences: sdkRefs, url: `${id}/${settingsPath}` },
    resolveURL: path => byPath.get(path) ?? path,
    expressions: refs.Expressions ?? [],
    async json<T>(path: string) {
      const file = zip.file(path)
      return file ? JSON.parse(await file.async('text')) as T : null
    },
    revoke() {
      urls.splice(0).forEach(u => URL.revokeObjectURL(u))
    },
  }
}
