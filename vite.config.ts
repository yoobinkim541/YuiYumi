import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

// Dev-only: serve api/*.ts (Web-standard `POST(request)` / `GET(request)` handlers, the same
// files Vercel deploys) through Vite so local development needs no Vercel CLI.
function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const url = new URL(req.url, 'http://localhost')
          const segments = url.pathname.replace(/^\/api\//, '').split('/')
          const candidates = [
            `/api/${segments.join('/')}.ts`,
            `/api/${segments.slice(0, -1).join('/')}/[${'service'}].ts`,
          ]
          let mod: Record<string, unknown> | undefined
          for (const file of candidates) {
            try { mod = await server.ssrLoadModule(file); break } catch { /* try next */ }
          }
          const handler = mod?.[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined
          if (!handler) { res.statusCode = 404; res.end('not found'); return }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          server.config.logger.error(String(e))
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'internal' }))
        }
      })
    },
  }
}

// Desktop app (Tauri, `--mode desktop`): desktop.html instead of index.html, plus stand-ins for
// modules that assume the in-page virtual desktop. The settings/dashboard panels run in their
// own windows, so their '@/voice' and '@/nunchi' imports go to mirrors of the overlay's state.
const DESKTOP_API_PLACEHOLDER = 'https://yuiyumi.vercel.app'

function desktopShims(): Plugin {
  const settingsDir = fileURLToPath(new URL('./src/settings/', import.meta.url))
  const shim = (p: string) => fileURLToPath(new URL(`./src/desktop-app/${p}`, import.meta.url))
  return {
    name: 'desktop-shims',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '@/desktop/actuator') return shim('shims/actuator.ts')
      if (!importer?.split('?')[0]!.startsWith(settingsDir)) return null
      if (source === '@/voice') return shim('panel/voice.ts')
      if (source === '@/nunchi') return shim('panel/nunchi.ts')
      return null
    },
  }
}

export default defineConfig(({ mode, command }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  const desktop = mode === 'desktop'
  // Desktop builds call the deployed API (DESKTOP_API_BASE); desktop dev uses its own dev server.
  const desktopApiBase = process.env.DESKTOP_API_BASE ?? (command === 'build' ? DESKTOP_API_PLACEHOLDER : '')
  return {
    plugins: [vue(), apiDevServer(), ...(desktop ? [desktopShims()] : [])],
    define: desktop ? { 'import.meta.env.VITE_API_BASE': JSON.stringify(desktopApiBase) } : {},
    // Multi-page: index.html is the web app, desktop.html the desktop app; each mode builds its own.
    build: {
      outDir: desktop ? 'dist-desktop' : 'dist',
      emptyOutDir: true,
      rollupOptions: { input: fileURLToPath(new URL(desktop ? './desktop.html' : './index.html', import.meta.url)) },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['onnxruntime-web', '@ricky0123/vad-web'],
      include: ['pixi.js', 'pixi-live2d-display/cubism4', 'cubism-web-batched-renderer', 'jszip'],
    },
    // cors: false lets api/* answer the desktop app's preflight itself (server/http.ts).
    server: { port: 5180, cors: false },
  }
})
