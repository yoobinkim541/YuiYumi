import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const repo = resolve(__dirname, '../../..')

export default defineConfig({
  root: __dirname,
  publicDir: resolve(repo, 'public'),
  server: { port: 5199, strictPort: true, fs: { allow: [repo] } },
  optimizeDeps: { include: ['pixi.js', 'pixi-live2d-display/cubism4'] },
})
