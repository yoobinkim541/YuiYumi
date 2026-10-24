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

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [vue(), apiDevServer()],
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
    server: { port: 5173 },
  }
})
